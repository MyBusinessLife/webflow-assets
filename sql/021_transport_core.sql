-- 021_transport_core.sql
-- Transport module (fleet / drivers / tours / shipments / pricing)
-- Goals:
-- - Multi-tenant safe (organization_id + RLS)
-- - Evolutive (metadata jsonb on core entities)
-- - Gated by SaaS module: "transport"

create extension if not exists pgcrypto;
create schema if not exists app;

-- Ensure the plan bundles can carry the new module.
-- We include "transport" by default in the maximal offer (scale).
do $$
begin
  if to_regclass('public.billing_plans') is not null then
    -- Scale => transport enabled
    update public.billing_plans
    set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{transport}', 'true'::jsonb, true)
    where code = 'scale';

    -- Starter/Growth: only set if the key does not exist yet (avoid overriding custom setups).
    update public.billing_plans
    set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{transport}', 'false'::jsonb, true)
    where code in ('starter','growth')
      and not (coalesce(modules, '{}'::jsonb) ? 'transport');
  end if;
end
$$;

-- =========================================================
-- Core tables
-- =========================================================

create table if not exists public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plate_number text not null,
  name text,
  vehicle_type text,
  brand text,
  model text,
  vin text,
  payload_kg int4,
  volume_m3 numeric,
  fuel_type text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, plate_number)
);

create index if not exists transport_vehicles_org_active_idx
  on public.transport_vehicles (organization_id)
  where is_active = true;
create index if not exists transport_vehicles_org_created_idx
  on public.transport_vehicles (organization_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.transport_vehicles;
create trigger trg_fill_organization_id
before insert on public.transport_vehicles
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_transport_vehicles on public.transport_vehicles;
create trigger trg_touch_transport_vehicles
before update on public.transport_vehicles
for each row execute function app.touch_updated_at();

create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  license_number text,
  license_expiry date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create index if not exists transport_drivers_org_active_idx
  on public.transport_drivers (organization_id)
  where is_active = true;
create index if not exists transport_drivers_org_created_idx
  on public.transport_drivers (organization_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.transport_drivers;
create trigger trg_fill_organization_id
before insert on public.transport_drivers
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_transport_drivers on public.transport_drivers;
create trigger trg_touch_transport_drivers
before update on public.transport_drivers
for each row execute function app.touch_updated_at();

create table if not exists public.transport_rate_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  pricing_mode text not null default 'distance', -- flat | distance | distance_tiers
  currency text not null default 'EUR',
  base_fee_cents int8 not null default 0,
  per_km_cents int8 not null default 0,
  min_price_cents int8 not null default 0,
  tiers jsonb not null default '[]'::jsonb, -- [{ up_to_km: 50, per_km_cents: 120 }, ...]
  vat_rate numeric, -- optional VAT rate for the service (defaults can be applied in UI)
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists transport_rate_cards_org_active_idx
  on public.transport_rate_cards (organization_id)
  where is_active = true;
create index if not exists transport_rate_cards_org_created_idx
  on public.transport_rate_cards (organization_id, created_at desc);

do $$
begin
  if to_regclass('public.transport_rate_cards') is not null and not exists (
    select 1 from pg_constraint where conname = 'transport_rate_cards_pricing_mode_check'
  ) then
    alter table public.transport_rate_cards
      add constraint transport_rate_cards_pricing_mode_check
      check (pricing_mode in ('flat','distance','distance_tiers')) not valid;
  end if;
end
$$;

drop trigger if exists trg_fill_organization_id on public.transport_rate_cards;
create trigger trg_fill_organization_id
before insert on public.transport_rate_cards
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_transport_rate_cards on public.transport_rate_cards;
create trigger trg_touch_transport_rate_cards
before update on public.transport_rate_cards
for each row execute function app.touch_updated_at();

create table if not exists public.transport_tours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  tour_date date,
  status text not null default 'draft', -- draft | planned | in_progress | done | canceled
  driver_id uuid references public.transport_drivers(id) on delete set null,
  vehicle_id uuid references public.transport_vehicles(id) on delete set null,

  start_name text,
  start_address text,
  start_postcode text,
  start_city text,
  start_country text not null default 'FR',
  start_lat double precision,
  start_lng double precision,

  end_name text,
  end_address text,
  end_postcode text,
  end_city text,
  end_country text not null default 'FR',
  end_lat double precision,
  end_lng double precision,

  distance_m int8,
  duration_s int8,
  notes text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transport_tours_org_date_idx
  on public.transport_tours (organization_id, tour_date desc, created_at desc);
create index if not exists transport_tours_org_status_idx
  on public.transport_tours (organization_id, status, tour_date desc);

do $$
begin
  if to_regclass('public.transport_tours') is not null and not exists (
    select 1 from pg_constraint where conname = 'transport_tours_status_check'
  ) then
    alter table public.transport_tours
      add constraint transport_tours_status_check
      check (status in ('draft','planned','in_progress','done','canceled')) not valid;
  end if;
end
$$;

drop trigger if exists trg_fill_organization_id on public.transport_tours;
create trigger trg_fill_organization_id
before insert on public.transport_tours
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_transport_tours on public.transport_tours;
create trigger trg_touch_transport_tours
before update on public.transport_tours
for each row execute function app.touch_updated_at();

create table if not exists public.transport_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  title text,
  status text not null default 'draft', -- draft | planned | in_progress | done | canceled

  client_id uuid references public.clients(id) on delete set null,
  tour_id uuid references public.transport_tours(id) on delete set null,
  tour_sequence int4,

  driver_id uuid references public.transport_drivers(id) on delete set null,
  vehicle_id uuid references public.transport_vehicles(id) on delete set null,

  pickup_name text,
  pickup_address text,
  pickup_postcode text,
  pickup_city text,
  pickup_country text not null default 'FR',
  pickup_lat double precision,
  pickup_lng double precision,

  delivery_name text,
  delivery_address text,
  delivery_postcode text,
  delivery_city text,
  delivery_country text not null default 'FR',
  delivery_lat double precision,
  delivery_lng double precision,

  planned_pickup_at timestamptz,
  planned_delivery_at timestamptz,
  actual_pickup_at timestamptz,
  actual_delivery_at timestamptz,

  weight_kg numeric,
  volume_m3 numeric,
  pallet_count int4,

  distance_m int8,
  duration_s int8,

  rate_card_id uuid references public.transport_rate_cards(id) on delete set null,
  price_cents int8,
  currency text not null default 'EUR',
  vat_rate numeric,

  devis_id uuid references public.devis(id) on delete set null,
  facture_id uuid references public.factures(id) on delete set null,

  notes text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transport_shipments_org_created_idx
  on public.transport_shipments (organization_id, created_at desc);
create index if not exists transport_shipments_org_status_idx
  on public.transport_shipments (organization_id, status, created_at desc);
create index if not exists transport_shipments_org_client_idx
  on public.transport_shipments (organization_id, client_id, created_at desc);
create index if not exists transport_shipments_org_tour_idx
  on public.transport_shipments (organization_id, tour_id, tour_sequence);

do $$
begin
  if to_regclass('public.transport_shipments') is not null and not exists (
    select 1 from pg_constraint where conname = 'transport_shipments_status_check'
  ) then
    alter table public.transport_shipments
      add constraint transport_shipments_status_check
      check (status in ('draft','planned','in_progress','done','canceled')) not valid;
  end if;
end
$$;

drop trigger if exists trg_fill_organization_id on public.transport_shipments;
create trigger trg_fill_organization_id
before insert on public.transport_shipments
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_transport_shipments on public.transport_shipments;
create trigger trg_touch_transport_shipments
before update on public.transport_shipments
for each row execute function app.touch_updated_at();

-- =========================================================
-- RLS policies (gated by org membership + "transport" module)
-- =========================================================

alter table public.transport_vehicles enable row level security;
alter table public.transport_vehicles force row level security;
alter table public.transport_drivers enable row level security;
alter table public.transport_drivers force row level security;
alter table public.transport_rate_cards enable row level security;
alter table public.transport_rate_cards force row level security;
alter table public.transport_tours enable row level security;
alter table public.transport_tours force row level security;
alter table public.transport_shipments enable row level security;
alter table public.transport_shipments force row level security;

do $$
begin
  -- transport_vehicles
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_select'
  ) then
    create policy transport_vehicles_select
      on public.transport_vehicles
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_write'
  ) then
    create policy transport_vehicles_write
      on public.transport_vehicles
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_update'
  ) then
    create policy transport_vehicles_update
      on public.transport_vehicles
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_delete_admin'
  ) then
    create policy transport_vehicles_delete_admin
      on public.transport_vehicles
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  -- transport_drivers
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_select'
  ) then
    create policy transport_drivers_select
      on public.transport_drivers
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_write'
  ) then
    create policy transport_drivers_write
      on public.transport_drivers
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_update'
  ) then
    create policy transport_drivers_update
      on public.transport_drivers
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_delete_admin'
  ) then
    create policy transport_drivers_delete_admin
      on public.transport_drivers
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  -- transport_rate_cards
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_rate_cards' and policyname='transport_rate_cards_select'
  ) then
    create policy transport_rate_cards_select
      on public.transport_rate_cards
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_rate_cards' and policyname='transport_rate_cards_write'
  ) then
    create policy transport_rate_cards_write
      on public.transport_rate_cards
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_rate_cards' and policyname='transport_rate_cards_update'
  ) then
    create policy transport_rate_cards_update
      on public.transport_rate_cards
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_rate_cards' and policyname='transport_rate_cards_delete_admin'
  ) then
    create policy transport_rate_cards_delete_admin
      on public.transport_rate_cards
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  -- transport_tours
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_tours' and policyname='transport_tours_select'
  ) then
    create policy transport_tours_select
      on public.transport_tours
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_tours' and policyname='transport_tours_write'
  ) then
    create policy transport_tours_write
      on public.transport_tours
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_tours' and policyname='transport_tours_update'
  ) then
    create policy transport_tours_update
      on public.transport_tours
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_tours' and policyname='transport_tours_delete_admin'
  ) then
    create policy transport_tours_delete_admin
      on public.transport_tours
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  -- transport_shipments
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_shipments' and policyname='transport_shipments_select'
  ) then
    create policy transport_shipments_select
      on public.transport_shipments
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_shipments' and policyname='transport_shipments_write'
  ) then
    create policy transport_shipments_write
      on public.transport_shipments
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_shipments' and policyname='transport_shipments_update'
  ) then
    create policy transport_shipments_update
      on public.transport_shipments
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transport_shipments' and policyname='transport_shipments_delete_admin'
  ) then
    create policy transport_shipments_delete_admin
      on public.transport_shipments
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id, 'transport'));
  end if;
end
$$;

