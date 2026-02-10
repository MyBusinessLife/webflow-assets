-- 041_loyalty_core.sql
-- Loyalty (fidelisation) core:
-- - loyalty programs
-- - members (linked to clients)
-- - points ledger + cached balance
-- - optional auto-award on invoice paid
--
-- Design goals:
-- - Multi-tenant (organization_id) + RLS
-- - Evolutive (metadata jsonb, source_type/source_id)
-- - Integrates with billing (public.factures + public.invoice_payments)
-- - Gated by SaaS module: "loyalty"
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Plan bundles: add module "loyalty"
-- =========================================================
do $$
begin
  if to_regclass('public.billing_plans') is null then
    return;
  end if;

  -- Enable for enterprise/max + restaurant by default.
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{loyalty}', 'true'::jsonb, true),
      updated_at = now()
  where code in ('scale','ultimate','restaurant');

  -- For other offers: only set default false if the key does not exist yet.
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{loyalty}', 'false'::jsonb, true),
      updated_at = now()
  where code in ('starter','growth','transport','rental')
    and not (coalesce(modules, '{}'::jsonb) ? 'loyalty');

  -- Refresh entitlements for existing subscriptions so the new module flag is applied immediately.
  if to_regclass('public.organization_subscriptions') is not null then
    update public.organization_subscriptions
    set status = status
    where id is not null;
  end if;
end
$$;

-- =========================================================
-- Programs
-- =========================================================
create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Programme de fidélité',
  is_default boolean not null default true,
  is_active boolean not null default true,
  apply_on_invoice_paid boolean not null default false,
  points_per_euro numeric not null default 1.0,
  rounding text not null default 'floor', -- floor|round|ceil
  min_invoice_total_cents int8 not null default 0,
  terms text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.loyalty_programs') is not null and not exists (
    select 1 from pg_constraint where conname = 'loyalty_programs_rounding_chk'
  ) then
    alter table public.loyalty_programs
      add constraint loyalty_programs_rounding_chk
      check (rounding in ('floor','round','ceil')) not valid;
  end if;
end
$$;

create unique index if not exists loyalty_programs_org_default_uidx
  on public.loyalty_programs (organization_id)
  where is_default = true;

create index if not exists loyalty_programs_org_idx
  on public.loyalty_programs (organization_id, is_active, created_at desc);

drop trigger if exists trg_fill_organization_id on public.loyalty_programs;
create trigger trg_fill_organization_id
before insert on public.loyalty_programs
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_loyalty_programs on public.loyalty_programs;
create trigger trg_touch_loyalty_programs
before update on public.loyalty_programs
for each row execute function app.touch_updated_at();

-- Bootstrap one default program per org (best effort).
create or replace function app.bootstrap_loyalty_for_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loyalty_programs (organization_id, name, is_default, is_active, apply_on_invoice_paid, points_per_euro, rounding)
  values (new.id, 'Programme de fidélité', true, true, false, 1.0, 'floor')
  on conflict (organization_id) where is_default = true do nothing;

  return new;
end;
$$;

grant execute on function app.bootstrap_loyalty_for_org() to authenticated, anon;

drop trigger if exists trg_bootstrap_loyalty_for_org on public.organizations;
create trigger trg_bootstrap_loyalty_for_org
after insert on public.organizations
for each row execute function app.bootstrap_loyalty_for_org();

-- Backfill for existing orgs (only where loyalty is enabled in the current entitlements).
do $$
declare
  o record;
begin
  for o in
    select e.organization_id
    from public.organization_entitlements e
    where coalesce((e.modules ->> 'loyalty')::boolean, false) = true
  loop
    insert into public.loyalty_programs (organization_id, name, is_default, is_active, apply_on_invoice_paid, points_per_euro, rounding)
    values (o.organization_id, 'Programme de fidélité', true, true, false, 1.0, 'floor')
    on conflict (organization_id) where is_default = true do nothing;
  end loop;
end
$$;

-- When an org becomes entitled to loyalty later (subscription change), ensure a default program exists.
create or replace function app.bootstrap_loyalty_from_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((new.modules ->> 'loyalty')::boolean, false) <> true then
    return new;
  end if;

  insert into public.loyalty_programs (organization_id, name, is_default, is_active, apply_on_invoice_paid, points_per_euro, rounding)
  values (new.organization_id, 'Programme de fidélité', true, true, false, 1.0, 'floor')
  on conflict (organization_id) where is_default = true do nothing;

  return new;
end;
$$;

grant execute on function app.bootstrap_loyalty_from_entitlements() to authenticated, anon;

drop trigger if exists trg_bootstrap_loyalty_from_entitlements on public.organization_entitlements;
create trigger trg_bootstrap_loyalty_from_entitlements
after insert or update of modules on public.organization_entitlements
for each row execute function app.bootstrap_loyalty_from_entitlements();

-- =========================================================
-- Members + Ledger
-- =========================================================
create table if not exists public.loyalty_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'active', -- active|suspended|archived
  points_balance int8 not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, client_id)
);

do $$
begin
  if to_regclass('public.loyalty_members') is not null and not exists (
    select 1 from pg_constraint where conname = 'loyalty_members_status_chk'
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_status_chk
      check (status in ('active','suspended','archived')) not valid;
  end if;

  if to_regclass('public.loyalty_members') is not null and not exists (
    select 1 from pg_constraint where conname = 'loyalty_members_points_chk'
  ) then
    alter table public.loyalty_members
      add constraint loyalty_members_points_chk
      check (points_balance >= 0) not valid;
  end if;
end
$$;

create index if not exists loyalty_members_org_idx
  on public.loyalty_members (organization_id, points_balance desc, created_at desc);

drop trigger if exists trg_fill_organization_id on public.loyalty_members;
create trigger trg_fill_organization_id
before insert on public.loyalty_members
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_loyalty_members on public.loyalty_members;
create trigger trg_touch_loyalty_members
before update on public.loyalty_members
for each row execute function app.touch_updated_at();

create or replace function app.refcheck_loyalty_members()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _prog_org uuid;
  _client_org uuid;
begin
  select organization_id into _prog_org from public.loyalty_programs where id = new.program_id;
  if _prog_org is null then
    raise exception 'loyalty_members: program_id not found or not visible';
  end if;

  select organization_id into _client_org from public.clients where id = new.client_id;
  if _client_org is null then
    raise exception 'loyalty_members: client_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _prog_org;
  end if;

  if new.organization_id <> _prog_org or new.organization_id <> _client_org then
    raise exception 'loyalty_members: organization mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_loyalty_members on public.loyalty_members;
create trigger trg_refcheck_loyalty_members
before insert or update on public.loyalty_members
for each row execute function app.refcheck_loyalty_members();

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  member_id uuid not null references public.loyalty_members(id) on delete cascade,
  source_type text not null default 'manual', -- manual|invoice|pos_order|restaurant_order|import|adjustment
  source_id uuid,
  points int4 not null default 0, -- signed (+ earn, - redeem)
  amount_cents int8 not null default 0,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.loyalty_events') is not null and not exists (
    select 1 from pg_constraint where conname = 'loyalty_events_source_type_chk'
  ) then
    alter table public.loyalty_events
      add constraint loyalty_events_source_type_chk
      check (source_type in ('manual','invoice','pos_order','restaurant_order','import','adjustment')) not valid;
  end if;
end
$$;

create index if not exists loyalty_events_member_idx
  on public.loyalty_events (member_id, created_at desc);

create index if not exists loyalty_events_org_idx
  on public.loyalty_events (organization_id, created_at desc);

create unique index if not exists loyalty_events_invoice_uidx
  on public.loyalty_events (program_id, source_type, source_id)
  where source_type = 'invoice'
    and source_id is not null;

drop trigger if exists trg_fill_organization_id on public.loyalty_events;
create trigger trg_fill_organization_id
before insert on public.loyalty_events
for each row execute function app.fill_organization_id();

create or replace function app.refcheck_loyalty_events()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _member public.loyalty_members;
begin
  select * into _member from public.loyalty_members where id = new.member_id;
  if _member.id is null then
    raise exception 'loyalty_events: member_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _member.organization_id;
  end if;
  if new.program_id is null then
    new.program_id := _member.program_id;
  end if;

  if new.organization_id <> _member.organization_id then
    raise exception 'loyalty_events: organization mismatch';
  end if;
  if new.program_id <> _member.program_id then
    raise exception 'loyalty_events: program mismatch';
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_loyalty_events on public.loyalty_events;
create trigger trg_refcheck_loyalty_events
before insert on public.loyalty_events
for each row execute function app.refcheck_loyalty_events();

-- Cached balance update (insert/delete)
create or replace function app.apply_loyalty_event_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _delta int8;
  _member_id uuid;
begin
  if tg_op = 'INSERT' then
    _delta := coalesce(new.points, 0)::int8;
    _member_id := new.member_id;
  elsif tg_op = 'DELETE' then
    _delta := -coalesce(old.points, 0)::int8;
    _member_id := old.member_id;
  else
    return coalesce(new, old);
  end if;

  if _member_id is null or _delta = 0 then
    return coalesce(new, old);
  end if;

  update public.loyalty_members
  set points_balance = greatest(0, coalesce(points_balance, 0) + _delta),
      updated_at = now()
  where id = _member_id;

  return coalesce(new, old);
end;
$$;

grant execute on function app.apply_loyalty_event_to_balance() to authenticated, anon;

drop trigger if exists trg_apply_loyalty_event_to_balance on public.loyalty_events;
create trigger trg_apply_loyalty_event_to_balance
after insert or delete on public.loyalty_events
for each row execute function app.apply_loyalty_event_to_balance();

-- =========================================================
-- Auto-award points when an invoice is fully paid
-- =========================================================
create or replace function app.award_loyalty_points_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _prog public.loyalty_programs;
  _member_id uuid;
  _amount_eur numeric;
  _raw_points numeric;
  _points int4;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = coalesce(new.status, '') then
    return new;
  end if;

  if new.status <> 'paid' then
    return new;
  end if;

  if new.client_id is null then
    return new;
  end if;

  _org := new.organization_id;
  if _org is null then
    return new;
  end if;

  if not app.org_has_module(_org, 'loyalty') then
    return new;
  end if;

  select *
  into _prog
  from public.loyalty_programs
  where organization_id = _org
    and is_active = true
  order by is_default desc, created_at asc
  limit 1;

  if _prog.id is null then
    return new;
  end if;

  if not coalesce(_prog.apply_on_invoice_paid, false) then
    return new;
  end if;

  if coalesce(new.total_cents, 0) < coalesce(_prog.min_invoice_total_cents, 0) then
    return new;
  end if;

  _amount_eur := (coalesce(new.total_cents, 0)::numeric / 100.0);
  _raw_points := _amount_eur * coalesce(_prog.points_per_euro, 0);

  if _raw_points <= 0 then
    return new;
  end if;

  if _prog.rounding = 'ceil' then
    _points := ceil(_raw_points)::int4;
  elsif _prog.rounding = 'round' then
    _points := round(_raw_points)::int4;
  else
    _points := floor(_raw_points)::int4;
  end if;

  if _points <= 0 then
    return new;
  end if;

  insert into public.loyalty_members (organization_id, program_id, client_id, status)
  values (_org, _prog.id, new.client_id, 'active')
  on conflict (program_id, client_id) do nothing;

  select id into _member_id
  from public.loyalty_members
  where program_id = _prog.id
    and client_id = new.client_id
  limit 1;

  if _member_id is null then
    return new;
  end if;

  insert into public.loyalty_events (organization_id, program_id, member_id, source_type, source_id, points, amount_cents, note, created_by)
  values (_org, _prog.id, _member_id, 'invoice', new.id, _points, coalesce(new.total_cents, 0), 'Points automatiques (facture payée)', auth.uid())
  on conflict (program_id, source_type, source_id) do nothing;

  return new;
end;
$$;

grant execute on function app.award_loyalty_points_on_invoice_paid() to authenticated, anon;

drop trigger if exists trg_award_loyalty_points_on_invoice_paid on public.factures;
create trigger trg_award_loyalty_points_on_invoice_paid
after update of status on public.factures
for each row execute function app.award_loyalty_points_on_invoice_paid();

-- =========================================================
-- RLS (gated by module "loyalty")
-- =========================================================
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_programs force row level security;
alter table public.loyalty_members enable row level security;
alter table public.loyalty_members force row level security;
alter table public.loyalty_events enable row level security;
alter table public.loyalty_events force row level security;

do $$
begin
  -- Programs
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_programs' and policyname='loyalty_programs_select'
  ) then
    create policy loyalty_programs_select
      on public.loyalty_programs
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_programs' and policyname='loyalty_programs_write_admin'
  ) then
    create policy loyalty_programs_write_admin
      on public.loyalty_programs
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  -- Members
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_members' and policyname='loyalty_members_select'
  ) then
    create policy loyalty_members_select
      on public.loyalty_members
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_members' and policyname='loyalty_members_write_admin'
  ) then
    create policy loyalty_members_write_admin
      on public.loyalty_members
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  -- Events: members read, admins insert/delete
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_events' and policyname='loyalty_events_select'
  ) then
    create policy loyalty_events_select
      on public.loyalty_events
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_events' and policyname='loyalty_events_insert_admin'
  ) then
    create policy loyalty_events_insert_admin
      on public.loyalty_events
      for insert
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='loyalty_events' and policyname='loyalty_events_delete_admin'
  ) then
    create policy loyalty_events_delete_admin
      on public.loyalty_events
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'loyalty'));
  end if;
end
$$;
