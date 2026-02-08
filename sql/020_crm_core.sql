-- 020_crm_core.sql
-- CRM core: pipelines, stages, deals, contacts (works with existing public.clients).
--
-- Design goals:
-- - Multi-tenant (organization_id everywhere) + RLS using app.is_org_member().
-- - Monday-like pipelines/stages for deals (kanban).
-- - Extensible: keep advanced attributes in metadata/custom fields (see 016_custom_fields).

create extension if not exists pgcrypto;
create schema if not exists app;

-- ============
-- Contacts
-- ============
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  name text not null,
  email text,
  phone text,
  job_title text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_contacts_org_client_idx
  on public.client_contacts (organization_id, client_id, is_active, name);

drop trigger if exists trg_fill_organization_id on public.client_contacts;
create trigger trg_fill_organization_id
before insert on public.client_contacts
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_client_contacts on public.client_contacts;
create trigger trg_touch_client_contacts
before update on public.client_contacts
for each row execute function app.touch_updated_at();

-- ============
-- Pipelines + Stages
-- ============
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order int4 not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create unique index if not exists crm_pipelines_org_default_uidx
  on public.crm_pipelines (organization_id)
  where is_default = true;

create index if not exists crm_pipelines_org_idx
  on public.crm_pipelines (organization_id, is_active, sort_order, name);

drop trigger if exists trg_fill_organization_id on public.crm_pipelines;
create trigger trg_fill_organization_id
before insert on public.crm_pipelines
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_crm_pipelines on public.crm_pipelines;
create trigger trg_touch_crm_pipelines
before update on public.crm_pipelines
for each row execute function app.touch_updated_at();

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  key text not null,
  name text not null,
  sort_order int4 not null default 0,
  color text,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, key)
);

do $$
begin
  if to_regclass('public.crm_stages') is not null and not exists (
    select 1 from pg_constraint where conname = 'crm_stages_won_lost_chk'
  ) then
    alter table public.crm_stages
      add constraint crm_stages_won_lost_chk
      check (not (is_won and is_lost));
  end if;
end
$$;

create index if not exists crm_stages_org_pipe_idx
  on public.crm_stages (organization_id, pipeline_id, sort_order, name);

drop trigger if exists trg_fill_organization_id on public.crm_stages;
create trigger trg_fill_organization_id
before insert on public.crm_stages
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_crm_stages on public.crm_stages;
create trigger trg_touch_crm_stages
before update on public.crm_stages
for each row execute function app.touch_updated_at();

-- ============
-- Deals
-- ============
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete restrict,
  stage_id uuid references public.crm_stages(id) on delete set null,

  title text not null,
  client_id uuid references public.clients(id) on delete set null,
  primary_contact_id uuid references public.client_contacts(id) on delete set null,
  owner_id uuid,

  status text not null default 'open',
  description text,
  source text,
  probability int4 not null default 50,
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,

  amount_cents int8 not null default 0,
  currency text not null default 'EUR',

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.crm_deals alter column amount_cents type int8 using amount_cents::int8;

do $$
begin
  if to_regclass('public.crm_deals') is not null and not exists (
    select 1 from pg_constraint where conname = 'crm_deals_status_chk'
  ) then
    alter table public.crm_deals
      add constraint crm_deals_status_chk
      check (status in ('open','won','lost','archived')) not valid;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.crm_deals') is not null and not exists (
    select 1 from pg_constraint where conname = 'crm_deals_probability_chk'
  ) then
    alter table public.crm_deals
      add constraint crm_deals_probability_chk
      check (probability >= 0 and probability <= 100) not valid;
  end if;

  if to_regclass('public.crm_deals') is not null and not exists (
    select 1 from pg_constraint where conname = 'crm_deals_amount_chk'
  ) then
    alter table public.crm_deals
      add constraint crm_deals_amount_chk
      check (amount_cents >= 0) not valid;
  end if;
end
$$;

create index if not exists crm_deals_org_pipe_idx
  on public.crm_deals (organization_id, pipeline_id, updated_at desc);

create index if not exists crm_deals_org_stage_idx
  on public.crm_deals (organization_id, stage_id, updated_at desc);

create index if not exists crm_deals_org_client_idx
  on public.crm_deals (organization_id, client_id, updated_at desc);

drop trigger if exists trg_fill_organization_id on public.crm_deals;
create trigger trg_fill_organization_id
before insert on public.crm_deals
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_crm_deals on public.crm_deals;
create trigger trg_touch_crm_deals
before update on public.crm_deals
for each row execute function app.touch_updated_at();

-- ============
-- Notes (simple activity feed)
-- ============
create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null, -- 'deal' | 'client' | 'contact'
  entity_id uuid not null,
  content text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.crm_notes') is not null and not exists (
    select 1 from pg_constraint where conname = 'crm_notes_entity_type_chk'
  ) then
    alter table public.crm_notes
      add constraint crm_notes_entity_type_chk
      check (entity_type in ('deal','client','contact')) not valid;
  end if;
end
$$;

create index if not exists crm_notes_org_entity_idx
  on public.crm_notes (organization_id, entity_type, entity_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.crm_notes;
create trigger trg_fill_organization_id
before insert on public.crm_notes
for each row execute function app.fill_organization_id();

-- ============
-- Reference integrity (tenant-safe)
-- ============
create or replace function app.refcheck_client_contacts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _client_org uuid;
begin
  select organization_id into _client_org
  from public.clients
  where id = new.client_id;

  if _client_org is null then
    raise exception 'client_contacts: client_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _client_org;
  end if;

  if new.organization_id <> _client_org then
    raise exception 'client_contacts: client organization mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_client_contacts on public.client_contacts;
create trigger trg_refcheck_client_contacts
before insert or update on public.client_contacts
for each row execute function app.refcheck_client_contacts();

create or replace function app.refcheck_crm_stages()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _pipe_org uuid;
begin
  select organization_id into _pipe_org
  from public.crm_pipelines
  where id = new.pipeline_id;

  if _pipe_org is null then
    raise exception 'crm_stages: pipeline_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _pipe_org;
  end if;

  if new.organization_id <> _pipe_org then
    raise exception 'crm_stages: pipeline organization mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_crm_stages on public.crm_stages;
create trigger trg_refcheck_crm_stages
before insert or update on public.crm_stages
for each row execute function app.refcheck_crm_stages();

create or replace function app.refcheck_crm_deals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _pipe_org uuid;
  _stage_pipe uuid;
  _stage_org uuid;
  _client_org uuid;
  _contact_client uuid;
  _contact_org uuid;
begin
  select organization_id into _pipe_org
  from public.crm_pipelines
  where id = new.pipeline_id;

  if _pipe_org is null then
    raise exception 'crm_deals: pipeline_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _pipe_org;
  end if;

  if new.organization_id <> _pipe_org then
    raise exception 'crm_deals: pipeline organization mismatch';
  end if;

  if new.stage_id is not null then
    select pipeline_id, organization_id
    into _stage_pipe, _stage_org
    from public.crm_stages
    where id = new.stage_id;

    if _stage_pipe is null then
      raise exception 'crm_deals: stage_id not found or not visible';
    end if;

    if _stage_org <> new.organization_id then
      raise exception 'crm_deals: stage organization mismatch';
    end if;

    if _stage_pipe <> new.pipeline_id then
      raise exception 'crm_deals: stage pipeline mismatch';
    end if;
  end if;

  if new.primary_contact_id is not null then
    select client_id, organization_id
    into _contact_client, _contact_org
    from public.client_contacts
    where id = new.primary_contact_id;

    if _contact_org is null then
      raise exception 'crm_deals: primary_contact_id not found or not visible';
    end if;

    if _contact_org <> new.organization_id then
      raise exception 'crm_deals: contact organization mismatch';
    end if;

    if new.client_id is null then
      new.client_id := _contact_client;
    elsif _contact_client <> new.client_id then
      raise exception 'crm_deals: contact does not belong to client';
    end if;
  end if;

  if new.client_id is not null then
    select organization_id into _client_org
    from public.clients
    where id = new.client_id;

    if _client_org is null then
      raise exception 'crm_deals: client_id not found or not visible';
    end if;

    if _client_org <> new.organization_id then
      raise exception 'crm_deals: client organization mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_crm_deals on public.crm_deals;
create trigger trg_refcheck_crm_deals
before insert or update on public.crm_deals
for each row execute function app.refcheck_crm_deals();

-- ============
-- RLS
-- ============
do $$
declare
  _tbl text;
  _tables text[] := array[
    'client_contacts',
    'crm_pipelines',
    'crm_stages',
    'crm_deals',
    'crm_notes'
  ];
begin
  foreach _tbl in array _tables loop
    if to_regclass('public.' || _tbl) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', _tbl);
    execute format('alter table public.%I force row level security', _tbl);

    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=_tbl and policyname=_tbl || '_org_all'
    ) then
      execute format(
        'create policy %I on public.%I for all using (app.is_org_member(organization_id)) with check (app.is_org_member(organization_id))',
        _tbl || '_org_all',
        _tbl
      );
    end if;
  end loop;
end
$$;

-- ============
-- Bootstrap (default pipeline + stages)
-- ============
create or replace function app.bootstrap_crm_for_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _pipe_id uuid;
begin
  -- Default pipeline
  insert into public.crm_pipelines (organization_id, name, sort_order, is_default, is_active)
  values (new.id, 'Ventes', 0, true, true)
  on conflict (organization_id, name) do nothing;

  select id into _pipe_id
  from public.crm_pipelines
  where organization_id = new.id and name = 'Ventes'
  order by created_at asc
  limit 1;

  if _pipe_id is null then
    return new;
  end if;

  insert into public.crm_stages (organization_id, pipeline_id, key, name, sort_order, color, is_won, is_lost)
  values
    (new.id, _pipe_id, 'new',         'Nouveau',      10, '#60a5fa', false, false),
    (new.id, _pipe_id, 'qualified',   'Qualifie',     20, '#34d399', false, false),
    (new.id, _pipe_id, 'proposal',    'Proposition',  30, '#fbbf24', false, false),
    (new.id, _pipe_id, 'negotiation', 'Negotiation',  40, '#f97316', false, false),
    (new.id, _pipe_id, 'won',         'Gagne',        90, '#22c55e', true,  false),
    (new.id, _pipe_id, 'lost',        'Perdu',        99, '#ef4444', false, true)
  on conflict (pipeline_id, key) do nothing;

  return new;
end;
$$;

grant execute on function app.bootstrap_crm_for_org() to authenticated, anon;

drop trigger if exists trg_bootstrap_crm_for_org on public.organizations;
create trigger trg_bootstrap_crm_for_org
after insert on public.organizations
for each row execute function app.bootstrap_crm_for_org();

-- Backfill for existing organizations.
do $$
declare
  o record;
begin
  for o in select id from public.organizations loop
    -- emulate trigger call
    perform 1;
    insert into public.crm_pipelines (organization_id, name, sort_order, is_default, is_active)
    values (o.id, 'Ventes', 0, true, true)
    on conflict (organization_id, name) do nothing;
  end loop;
end
$$;

do $$
declare
  p record;
begin
  for p in
    select organization_id, id as pipeline_id
    from public.crm_pipelines
    where name = 'Ventes'
  loop
    insert into public.crm_stages (organization_id, pipeline_id, key, name, sort_order, color, is_won, is_lost)
    values
      (p.organization_id, p.pipeline_id, 'new',         'Nouveau',      10, '#60a5fa', false, false),
      (p.organization_id, p.pipeline_id, 'qualified',   'Qualifie',     20, '#34d399', false, false),
      (p.organization_id, p.pipeline_id, 'proposal',    'Proposition',  30, '#fbbf24', false, false),
      (p.organization_id, p.pipeline_id, 'negotiation', 'Negotiation',  40, '#f97316', false, false),
      (p.organization_id, p.pipeline_id, 'won',         'Gagne',        90, '#22c55e', true,  false),
      (p.organization_id, p.pipeline_id, 'lost',        'Perdu',        99, '#ef4444', false, true)
    on conflict (pipeline_id, key) do nothing;
  end loop;
end
$$;
