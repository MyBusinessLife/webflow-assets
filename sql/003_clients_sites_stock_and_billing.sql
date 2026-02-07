-- 003_clients_sites_stock_and_billing.sql
-- Customer model, site model, stock movements, and SaaS subscription primitives.

create extension if not exists pgcrypto;
create schema if not exists app;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_ref text,
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_org_idx on public.clients (organization_id, name);
create unique index if not exists clients_org_external_ref_uidx
  on public.clients (organization_id, external_ref)
  where external_ref is not null and external_ref <> '';

create table if not exists public.client_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  address text,
  city text,
  postal_code text,
  country text,
  support_phone text,
  access_notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_sites_org_client_idx on public.client_sites (organization_id, client_id);
create index if not exists client_sites_org_address_idx on public.client_sites (organization_id, address);

alter table if exists public.interventions add column if not exists client_id uuid;
alter table if exists public.interventions add column if not exists site_id uuid;

DO $$
BEGIN
  IF to_regclass('public.interventions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_client_id_fkey'
  ) THEN
    ALTER TABLE public.interventions
      ADD CONSTRAINT interventions_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.interventions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_site_id_fkey'
  ) THEN
    ALTER TABLE public.interventions
      ADD CONSTRAINT interventions_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.client_sites(id) ON DELETE SET NULL;
  END IF;
END
$$;

create index if not exists interventions_org_client_idx on public.interventions (organization_id, client_id, start_at desc);
create index if not exists interventions_org_site_idx on public.interventions (organization_id, site_id, start_at desc);

-- Backfill clients/sites from current denormalized interventions.
DO $$
BEGIN
  IF to_regclass('public.interventions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.clients (organization_id, external_ref, name)
  SELECT DISTINCT
    i.organization_id,
    nullif(trim(i.client_ref), ''),
    coalesce(nullif(trim(i.client_name), ''), 'Client sans nom')
  FROM public.interventions i
  WHERE i.organization_id IS NOT NULL
    AND coalesce(nullif(trim(i.client_name), ''), nullif(trim(i.client_ref), '')) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.organization_id = i.organization_id
        AND (
          (nullif(trim(i.client_ref), '') IS NOT NULL AND c.external_ref = nullif(trim(i.client_ref), ''))
          OR (c.name = coalesce(nullif(trim(i.client_name), ''), 'Client sans nom'))
        )
    );

  INSERT INTO public.client_sites (organization_id, client_id, name, address, support_phone)
  SELECT DISTINCT
    i.organization_id,
    c.id,
    nullif(trim(i.title), ''),
    nullif(trim(i.address), ''),
    nullif(trim(i.support_phone), '')
  FROM public.interventions i
  JOIN public.clients c
    ON c.organization_id = i.organization_id
   AND (
     (nullif(trim(i.client_ref), '') IS NOT NULL AND c.external_ref = nullif(trim(i.client_ref), ''))
      OR c.name = coalesce(nullif(trim(i.client_name), ''), 'Client sans nom')
   )
  WHERE i.organization_id IS NOT NULL
    AND nullif(trim(i.address), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.client_sites s
      WHERE s.organization_id = i.organization_id
        AND s.client_id = c.id
        AND coalesce(s.address, '') = coalesce(nullif(trim(i.address), ''), '')
    );

  UPDATE public.interventions i
  SET client_id = c.id
  FROM public.clients c
  WHERE i.organization_id = c.organization_id
    AND i.client_id IS NULL
    AND (
      (nullif(trim(i.client_ref), '') IS NOT NULL AND c.external_ref = nullif(trim(i.client_ref), ''))
      OR c.name = coalesce(nullif(trim(i.client_name), ''), 'Client sans nom')
    );

  UPDATE public.interventions i
  SET site_id = s.id
  FROM public.client_sites s
  WHERE i.organization_id = s.organization_id
    AND i.client_id = s.client_id
    AND i.site_id IS NULL
    AND coalesce(nullif(trim(i.address), ''), '') = coalesce(s.address, '');
END
$$;

-- Sync denormalized fields from client/site when ids are provided.
create or replace function app.sync_intervention_client_site_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _client public.clients;
  _site public.client_sites;
begin
  if new.client_id is not null then
    select * into _client from public.clients where id = new.client_id;
    if found then
      if new.organization_id is null then
        new.organization_id := _client.organization_id;
      end if;
      new.client_name := coalesce(new.client_name, _client.name);
      new.client_ref := coalesce(new.client_ref, _client.external_ref);
    end if;
  end if;

  if new.site_id is not null then
    select * into _site from public.client_sites where id = new.site_id;
    if found then
      if new.organization_id is null then
        new.organization_id := _site.organization_id;
      end if;
      new.address := coalesce(new.address, _site.address);
      new.support_phone := coalesce(new.support_phone, _site.support_phone);
    end if;
  end if;

  return new;
end;
$$;

grant execute on function app.sync_intervention_client_site_fields() to authenticated, anon;

drop trigger if exists trg_sync_intervention_client_site_fields on public.interventions;
create trigger trg_sync_intervention_client_site_fields
before insert or update of client_id, site_id on public.interventions
for each row execute function app.sync_intervention_client_site_fields();

-- Stock movements (audit + future inventory features).
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  intervention_id uuid references public.interventions(id) on delete set null,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment', 'return')),
  qty int4 not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_org_product_idx
  on public.stock_movements (organization_id, product_id, created_at desc);

-- Auto-apply stock_qty when a stock movement is created.
create or replace function app.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movement_type = 'in' then
    update public.products
      set stock_qty = coalesce(stock_qty, 0) + abs(new.qty),
          updated_at = now()
    where id = new.product_id;

  elsif new.movement_type = 'out' then
    update public.products
      set stock_qty = greatest(0, coalesce(stock_qty, 0) - abs(new.qty)),
          updated_at = now()
    where id = new.product_id;

  else
    update public.products
      set stock_qty = greatest(0, coalesce(stock_qty, 0) + new.qty),
          updated_at = now()
    where id = new.product_id;
  end if;

  return new;
end;
$$;

grant execute on function app.apply_stock_movement() to authenticated, anon;

drop trigger if exists trg_apply_stock_movement on public.stock_movements;
create trigger trg_apply_stock_movement
after insert on public.stock_movements
for each row execute function app.apply_stock_movement();

-- SaaS subscription primitives.
create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_price_cents int8 not null default 0,
  annual_price_cents int8 not null default 0,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_subscriptions_active_uidx
  on public.organization_subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due');

insert into public.billing_plans (code, name, monthly_price_cents, annual_price_cents)
select 'starter', 'Starter', 0, 0
where not exists (select 1 from public.billing_plans where code = 'starter');

insert into public.billing_plans (code, name, monthly_price_cents, annual_price_cents)
select 'growth', 'Growth', 9900, 99000
where not exists (select 1 from public.billing_plans where code = 'growth');

insert into public.billing_plans (code, name, monthly_price_cents, annual_price_cents)
select 'scale', 'Scale', 29900, 299000
where not exists (select 1 from public.billing_plans where code = 'scale');

-- RLS for new tables.
alter table public.clients enable row level security;
alter table public.clients force row level security;
alter table public.client_sites enable row level security;
alter table public.client_sites force row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_subscriptions force row level security;
alter table public.billing_plans enable row level security;
alter table public.billing_plans force row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_org_all'
  ) THEN
    create policy clients_org_all on public.clients
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_sites' AND policyname='client_sites_org_all'
  ) THEN
    create policy client_sites_org_all on public.client_sites
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stock_movements' AND policyname='stock_movements_org_all'
  ) THEN
    create policy stock_movements_org_all on public.stock_movements
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_subscriptions' AND policyname='organization_subscriptions_admin'
  ) THEN
    create policy organization_subscriptions_admin on public.organization_subscriptions
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='billing_plans' AND policyname='billing_plans_read'
  ) THEN
    create policy billing_plans_read on public.billing_plans
      for select
      using (true);
  END IF;
END
$$;
