-- 014_entitlements_and_stripe.sql
-- SaaS entitlements (modules) + Stripe Connect foundations.

create extension if not exists pgcrypto;
create schema if not exists app;

-- Organization entitlements (which modules are enabled per org).
create table if not exists public.organization_entitlements (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  modules jsonb not null default '{}'::jsonb, -- { billing: true, interventions: false, ... }
  limits jsonb not null default '{}'::jsonb, -- quotas per module (optional)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_entitlements_updated_at_idx
  on public.organization_entitlements (updated_at desc);

drop trigger if exists trg_touch_org_entitlements on public.organization_entitlements;
create trigger trg_touch_org_entitlements
before update on public.organization_entitlements
for each row execute function app.touch_updated_at();

-- Bootstrap entitlements for existing orgs.
insert into public.organization_entitlements (organization_id, modules, limits)
select
  o.id,
  jsonb_build_object(
    'billing', true,
    'interventions', true
  ),
  '{}'::jsonb
from public.organizations o
where not exists (
  select 1 from public.organization_entitlements e where e.organization_id = o.id
);

-- Helper for gating modules (UI or future RLS). Backward compatible: missing key => true.
create or replace function app.org_has_module(p_org uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (modules ->> p_module)::boolean
      from public.organization_entitlements e
      where e.organization_id = p_org
    ),
    true
  );
$$;

grant execute on function app.org_has_module(uuid, text) to authenticated, anon;

-- Stripe Connect (one connected account per org). Secrets stay server-side.
create table if not exists public.organization_stripe_connect (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_account_id text,
  is_live boolean not null default false, -- true for live mode, false for test mode
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  onboarding_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists org_stripe_connect_account_uidx
  on public.organization_stripe_connect (stripe_account_id)
  where stripe_account_id is not null and stripe_account_id <> '';

drop trigger if exists trg_touch_org_stripe_connect on public.organization_stripe_connect;
create trigger trg_touch_org_stripe_connect
before update on public.organization_stripe_connect
for each row execute function app.touch_updated_at();

-- Stripe webhook events (idempotency + troubleshooting).
create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  stripe_account_id text, -- connect account id (optional)
  livemode boolean,
  type text,
  api_version text,
  event_created int8,
  data jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count int4 not null default 0,
  last_attempt_at timestamptz,
  processing_error text,
  metadata jsonb not null default '{}'::jsonb,
  unique (stripe_event_id)
);

create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at desc);
create index if not exists stripe_webhook_events_org_idx
  on public.stripe_webhook_events (organization_id, received_at desc);

-- RLS
alter table public.organization_entitlements enable row level security;
alter table public.organization_entitlements force row level security;
alter table public.organization_stripe_connect enable row level security;
alter table public.organization_stripe_connect force row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_entitlements' and policyname='organization_entitlements_select_member'
  ) then
    create policy organization_entitlements_select_member
      on public.organization_entitlements
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_entitlements' and policyname='organization_entitlements_write_admin'
  ) then
    create policy organization_entitlements_write_admin
      on public.organization_entitlements
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_stripe_connect' and policyname='organization_stripe_connect_select_admin'
  ) then
    create policy organization_stripe_connect_select_admin
      on public.organization_stripe_connect
      for select
      using (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_stripe_connect' and policyname='organization_stripe_connect_write_admin'
  ) then
    create policy organization_stripe_connect_write_admin
      on public.organization_stripe_connect
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='stripe_webhook_events' and policyname='stripe_webhook_events_select_admin'
  ) then
    create policy stripe_webhook_events_select_admin
      on public.stripe_webhook_events
      for select
      using (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='stripe_webhook_events' and policyname='stripe_webhook_events_write_admin'
  ) then
    create policy stripe_webhook_events_write_admin
      on public.stripe_webhook_events
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

-- Ensure new organizations get their base rows.
create or replace function app.bootstrap_organization_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_profiles (organization_id, legal_name, trade_name, email)
  values (new.id, new.name, new.name, new.billing_email)
  on conflict (organization_id) do nothing;

  insert into public.organization_entitlements (organization_id, modules, limits)
  values (
    new.id,
    jsonb_build_object('billing', true, 'interventions', true),
    '{}'::jsonb
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

grant execute on function app.bootstrap_organization_rows() to authenticated, anon;

drop trigger if exists trg_bootstrap_organization_rows on public.organizations;
create trigger trg_bootstrap_organization_rows
after insert on public.organizations
for each row execute function app.bootstrap_organization_rows();

