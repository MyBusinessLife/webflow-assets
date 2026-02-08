-- 024_logistics_core.sql
-- Logistics / WMS core (warehouses, locations, stock levels, reservations)
--
-- Design goals:
-- - Multi-tenant (organization_id + RLS)
-- - Evolutive (metadata jsonb everywhere)
-- - Consistent stock: stock levels are maintained from stock_movements + reservations
-- - Gated by SaaS module: "logistics"

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Plan bundles: add module "logistics"
-- =========================================================
do $$
begin
  if to_regclass('public.billing_plans') is null then
    return;
  end if;

  -- Enable for maximal offers
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{logistics}', 'true'::jsonb, true),
      updated_at = now()
  where code in ('scale','ultimate');

  -- For other offers: only set if the key does not exist yet (avoid overriding custom setups).
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{logistics}', 'false'::jsonb, true),
      updated_at = now()
  where code in ('starter','growth','transport')
    and not (coalesce(modules, '{}'::jsonb) ? 'logistics');
end
$$;

-- =========================================================
-- Useful product attributes for logistics (optional)
-- =========================================================
alter table if exists public.products add column if not exists weight_kg numeric;
alter table if exists public.products add column if not exists volume_m3 numeric;

-- =========================================================
-- Warehouses / Locations
-- =========================================================
create table if not exists public.logistics_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  address text,
  city text,
  postal_code text,
  country text not null default 'FR',
  contact_name text,
  contact_email text,
  contact_phone text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists logistics_warehouses_org_code_uidx
  on public.logistics_warehouses (organization_id, code)
  where code is not null and code <> '';

create unique index if not exists logistics_warehouses_org_default_uidx
  on public.logistics_warehouses (organization_id)
  where is_default = true;

create index if not exists logistics_warehouses_org_active_idx
  on public.logistics_warehouses (organization_id, is_active, created_at desc);

drop trigger if exists trg_fill_organization_id on public.logistics_warehouses;
create trigger trg_fill_organization_id
before insert on public.logistics_warehouses
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_logistics_warehouses on public.logistics_warehouses;
create trigger trg_touch_logistics_warehouses
before update on public.logistics_warehouses
for each row execute function app.touch_updated_at();

create table if not exists public.logistics_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.logistics_warehouses(id) on delete cascade,
  code text not null,
  name text,
  location_type text not null default 'storage', -- receiving|shipping|storage|packing|quarantine|damaged
  zone text,
  aisle text,
  rack text,
  level text,
  bin text,
  is_pickable boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, code)
);

do $$
begin
  if to_regclass('public.logistics_locations') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_locations_type_check'
  ) then
    alter table public.logistics_locations
      add constraint logistics_locations_type_check
      check (location_type in ('receiving','shipping','storage','packing','quarantine','damaged')) not valid;
  end if;
end
$$;

create index if not exists logistics_locations_org_wh_idx
  on public.logistics_locations (organization_id, warehouse_id, is_active, location_type, code);

drop trigger if exists trg_fill_organization_id on public.logistics_locations;
create trigger trg_fill_organization_id
before insert on public.logistics_locations
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_logistics_locations on public.logistics_locations;
create trigger trg_touch_logistics_locations
before update on public.logistics_locations
for each row execute function app.touch_updated_at();

-- Auto-create core locations on warehouse creation (RECEIVING + SHIPPING).
create or replace function app.bootstrap_warehouse_locations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logistics_locations (organization_id, warehouse_id, code, name, location_type, is_pickable, is_active)
  values
    (new.organization_id, new.id, 'RECEIVING', 'Réception', 'receiving', false, true),
    (new.organization_id, new.id, 'SHIPPING',  'Expédition', 'shipping',  false, true)
  on conflict (warehouse_id, code) do nothing;
  return new;
end;
$$;

grant execute on function app.bootstrap_warehouse_locations() to authenticated, anon;

drop trigger if exists trg_bootstrap_warehouse_locations on public.logistics_warehouses;
create trigger trg_bootstrap_warehouse_locations
after insert on public.logistics_warehouses
for each row execute function app.bootstrap_warehouse_locations();

-- =========================================================
-- Stock levels (per location)
-- =========================================================
create table if not exists public.logistics_stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.logistics_warehouses(id) on delete cascade,
  location_id uuid not null references public.logistics_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  lot_code text,
  expires_at date,
  stock_state text not null default 'available', -- available|quarantine|damaged
  qty_on_hand int4 not null default 0,
  qty_reserved int4 not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lot_code_norm text generated always as (coalesce(lot_code, '')) stored,
  expires_at_norm date generated always as (coalesce(expires_at, '0001-01-01'::date)) stored
);

do $$
begin
  if to_regclass('public.logistics_stock_levels') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_stock_levels_state_check'
  ) then
    alter table public.logistics_stock_levels
      add constraint logistics_stock_levels_state_check
      check (stock_state in ('available','quarantine','damaged')) not valid;
  end if;

  if to_regclass('public.logistics_stock_levels') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_stock_levels_qty_check'
  ) then
    alter table public.logistics_stock_levels
      add constraint logistics_stock_levels_qty_check
      check (qty_on_hand >= 0 and qty_reserved >= 0 and qty_reserved <= qty_on_hand) not valid;
  end if;
end
$$;

create unique index if not exists logistics_stock_levels_uidx
  on public.logistics_stock_levels (organization_id, location_id, product_id, lot_code_norm, expires_at_norm, stock_state);

create index if not exists logistics_stock_levels_org_product_idx
  on public.logistics_stock_levels (organization_id, product_id);

create index if not exists logistics_stock_levels_org_wh_idx
  on public.logistics_stock_levels (organization_id, warehouse_id, location_id);

drop trigger if exists trg_fill_organization_id on public.logistics_stock_levels;
create trigger trg_fill_organization_id
before insert on public.logistics_stock_levels
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_logistics_stock_levels on public.logistics_stock_levels;
create trigger trg_touch_logistics_stock_levels
before update on public.logistics_stock_levels
for each row execute function app.touch_updated_at();

-- Keep warehouse_id consistent with the referenced location.
create or replace function app.sync_stock_level_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _loc public.logistics_locations;
begin
  select * into _loc from public.logistics_locations where id = new.location_id;
  if found then
    new.warehouse_id := _loc.warehouse_id;
    if new.organization_id is null then
      new.organization_id := _loc.organization_id;
    end if;
  end if;
  return new;
end;
$$;

grant execute on function app.sync_stock_level_warehouse() to authenticated, anon;

drop trigger if exists trg_sync_stock_level_warehouse on public.logistics_stock_levels;
create trigger trg_sync_stock_level_warehouse
before insert or update of location_id on public.logistics_stock_levels
for each row execute function app.sync_stock_level_warehouse();

-- =========================================================
-- Reservations (to compute availability / allocations)
-- =========================================================
create table if not exists public.logistics_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid references public.logistics_warehouses(id) on delete set null,
  location_id uuid references public.logistics_locations(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  qty int4 not null,
  status text not null default 'active', -- active|released|consumed|canceled
  reserved_for_type text, -- optional (ex: 'sales_order_line')
  reserved_for_id uuid, -- optional
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.logistics_stock_reservations') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_stock_reservations_qty_check'
  ) then
    alter table public.logistics_stock_reservations
      add constraint logistics_stock_reservations_qty_check
      check (qty > 0) not valid;
  end if;

  if to_regclass('public.logistics_stock_reservations') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_stock_reservations_status_check'
  ) then
    alter table public.logistics_stock_reservations
      add constraint logistics_stock_reservations_status_check
      check (status in ('active','released','consumed','canceled')) not valid;
  end if;
end
$$;

create index if not exists logistics_stock_reservations_org_product_idx
  on public.logistics_stock_reservations (organization_id, product_id, status, created_at desc);

drop trigger if exists trg_fill_organization_id on public.logistics_stock_reservations;
create trigger trg_fill_organization_id
before insert on public.logistics_stock_reservations
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_logistics_stock_reservations on public.logistics_stock_reservations;
create trigger trg_touch_logistics_stock_reservations
before update on public.logistics_stock_reservations
for each row execute function app.touch_updated_at();

-- =========================================================
-- Extend stock_movements to support warehouse/location context
-- =========================================================
alter table if exists public.stock_movements
  add column if not exists warehouse_id uuid;

alter table if exists public.stock_movements
  add column if not exists location_id uuid;

alter table if exists public.stock_movements
  add column if not exists move_group_id uuid;

alter table if exists public.stock_movements
  add column if not exists lot_code text;

alter table if exists public.stock_movements
  add column if not exists expires_at date;

alter table if exists public.stock_movements
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.stock_movements') is not null and not exists (
    select 1 from pg_constraint where conname = 'stock_movements_warehouse_id_fkey'
  ) then
    alter table public.stock_movements
      add constraint stock_movements_warehouse_id_fkey
      foreign key (warehouse_id) references public.logistics_warehouses(id) on delete set null;
  end if;

  if to_regclass('public.stock_movements') is not null and not exists (
    select 1 from pg_constraint where conname = 'stock_movements_location_id_fkey'
  ) then
    alter table public.stock_movements
      add constraint stock_movements_location_id_fkey
      foreign key (location_id) references public.logistics_locations(id) on delete set null;
  end if;
end
$$;

create index if not exists stock_movements_org_wh_loc_idx
  on public.stock_movements (organization_id, warehouse_id, location_id, created_at desc);

-- =========================================================
-- Triggers: keep logistics_stock_levels in sync
-- =========================================================

create or replace function app.apply_stock_movement_to_levels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _delta int4;
  _org uuid;
  _stock_state text := 'available';
  _level public.logistics_stock_levels;
  _lot text;
  _exp date;
  _has_module boolean;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  _org := coalesce(new.organization_id, app.current_organization_id());
  if _org is null then
    return new;
  end if;

  -- Only maintain levels for orgs that enabled the module (keeps noise low).
  _has_module := app.org_has_module(_org, 'logistics');
  if not _has_module then
    return new;
  end if;

  if new.warehouse_id is null or new.location_id is null then
    return new;
  end if;

  if new.product_id is null then
    return new;
  end if;

  _lot := nullif(btrim(coalesce(new.lot_code, '')), '');
  _exp := new.expires_at;

  if new.movement_type in ('in','return') then
    _delta := abs(coalesce(new.qty, 0));
  elsif new.movement_type = 'out' then
    _delta := -abs(coalesce(new.qty, 0));
  else
    _delta := coalesce(new.qty, 0);
  end if;

  if _delta = 0 then
    return new;
  end if;

  -- Lock row to serialize concurrent updates for the same (location, product, lot, exp, state).
  select *
  into _level
  from public.logistics_stock_levels l
  where l.organization_id = _org
    and l.location_id = new.location_id
    and l.product_id = new.product_id
    and l.lot_code_norm = coalesce(_lot, '')
    and l.expires_at_norm = coalesce(_exp, '0001-01-01'::date)
    and l.stock_state = _stock_state
  for update;

  if not found then
    if _delta < 0 then
      raise exception 'Insufficient stock for product % in location %.', new.product_id, new.location_id
        using errcode = 'P0001';
    end if;

    insert into public.logistics_stock_levels (
      organization_id, warehouse_id, location_id, product_id,
      lot_code, expires_at, stock_state,
      qty_on_hand, qty_reserved, metadata
    )
    values (
      _org, new.warehouse_id, new.location_id, new.product_id,
      _lot, _exp, _stock_state,
      _delta, 0, '{}'::jsonb
    )
    on conflict (organization_id, location_id, product_id, lot_code_norm, expires_at_norm, stock_state)
    do update
    set qty_on_hand = public.logistics_stock_levels.qty_on_hand + excluded.qty_on_hand,
        updated_at = now();

    return new;
  end if;

  if (_level.qty_on_hand + _delta) < 0 then
    raise exception 'Insufficient stock for product % in location %.', new.product_id, new.location_id
      using errcode = 'P0001';
  end if;

  update public.logistics_stock_levels
  set qty_on_hand = qty_on_hand + _delta,
      updated_at = now()
  where id = _level.id;

  return new;
end;
$$;

grant execute on function app.apply_stock_movement_to_levels() to authenticated, anon;

drop trigger if exists trg_apply_stock_movement_to_levels on public.stock_movements;
create trigger trg_apply_stock_movement_to_levels
after insert on public.stock_movements
for each row execute function app.apply_stock_movement_to_levels();

-- Keep qty_reserved in sync when reservations change.
create or replace function app.apply_reservation_to_levels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _loc uuid;
  _prod uuid;
  _qty_old int4 := 0;
  _qty_new int4 := 0;
  _delta int4 := 0;
  _has_module boolean;
  _level public.logistics_stock_levels;
begin
  _org := coalesce(new.organization_id, old.organization_id, app.current_organization_id());
  if _org is null then
    return coalesce(new, old);
  end if;

  _has_module := app.org_has_module(_org, 'logistics');
  if not _has_module then
    return coalesce(new, old);
  end if;

  _loc := coalesce(new.location_id, old.location_id);
  _prod := coalesce(new.product_id, old.product_id);

  if _loc is null or _prod is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    _qty_new := case when new.status = 'active' then coalesce(new.qty,0) else 0 end;
    _delta := _qty_new;
  elsif tg_op = 'DELETE' then
    _qty_old := case when old.status = 'active' then coalesce(old.qty,0) else 0 end;
    _delta := -_qty_old;
  else
    _qty_old := case when old.status = 'active' then coalesce(old.qty,0) else 0 end;
    _qty_new := case when new.status = 'active' then coalesce(new.qty,0) else 0 end;
    _delta := _qty_new - _qty_old;
  end if;

  if _delta = 0 then
    return coalesce(new, old);
  end if;

  -- Lock the "available" level row (reservations only apply to available stock).
  select * into _level
  from public.logistics_stock_levels l
  where l.organization_id = _org
    and l.location_id = _loc
    and l.product_id = _prod
    and l.stock_state = 'available'
    and l.lot_code_norm = ''
    and l.expires_at_norm = '0001-01-01'::date
  for update;

  if not found then
    if _delta < 0 then
      return coalesce(new, old);
    end if;
    raise exception 'No stock level row found for reservation (product %, location %).', _prod, _loc
      using errcode = 'P0001';
  end if;

  if (_level.qty_reserved + _delta) < 0 then
    raise exception 'Reservation underflow for product % in location %.', _prod, _loc
      using errcode = 'P0001';
  end if;

  if (_level.qty_reserved + _delta) > _level.qty_on_hand then
    raise exception 'Insufficient available stock to reserve (product %, location %).', _prod, _loc
      using errcode = 'P0001';
  end if;

  update public.logistics_stock_levels
  set qty_reserved = qty_reserved + _delta,
      updated_at = now()
  where id = _level.id;

  return coalesce(new, old);
end;
$$;

grant execute on function app.apply_reservation_to_levels() to authenticated, anon;

drop trigger if exists trg_apply_reservation_to_levels on public.logistics_stock_reservations;
create trigger trg_apply_reservation_to_levels
after insert or update of status, qty, location_id, product_id or delete on public.logistics_stock_reservations
for each row execute function app.apply_reservation_to_levels();

-- =========================================================
-- Reorder rules (alerts / replenishment suggestions)
-- =========================================================
create table if not exists public.logistics_reorder_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.logistics_warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  min_qty int4 not null default 0,
  target_qty int4,
  is_active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

do $$
begin
  if to_regclass('public.logistics_reorder_rules') is not null and not exists (
    select 1 from pg_constraint where conname = 'logistics_reorder_rules_qty_check'
  ) then
    alter table public.logistics_reorder_rules
      add constraint logistics_reorder_rules_qty_check
      check (min_qty >= 0 and (target_qty is null or target_qty >= min_qty)) not valid;
  end if;
end
$$;

create index if not exists logistics_reorder_rules_org_wh_idx
  on public.logistics_reorder_rules (organization_id, warehouse_id, is_active);

drop trigger if exists trg_fill_organization_id on public.logistics_reorder_rules;
create trigger trg_fill_organization_id
before insert on public.logistics_reorder_rules
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_logistics_reorder_rules on public.logistics_reorder_rules;
create trigger trg_touch_logistics_reorder_rules
before update on public.logistics_reorder_rules
for each row execute function app.touch_updated_at();

-- =========================================================
-- RLS policies (gated by org membership + "logistics" module)
-- =========================================================

alter table public.logistics_warehouses enable row level security;
alter table public.logistics_warehouses force row level security;
alter table public.logistics_locations enable row level security;
alter table public.logistics_locations force row level security;
alter table public.logistics_stock_levels enable row level security;
alter table public.logistics_stock_levels force row level security;
alter table public.logistics_stock_reservations enable row level security;
alter table public.logistics_stock_reservations force row level security;
alter table public.logistics_reorder_rules enable row level security;
alter table public.logistics_reorder_rules force row level security;

do $$
begin
  -- Warehouses: members can read, admins can write
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_warehouses' and policyname='logistics_warehouses_select'
  ) then
    create policy logistics_warehouses_select
      on public.logistics_warehouses
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_warehouses' and policyname='logistics_warehouses_write'
  ) then
    create policy logistics_warehouses_write
      on public.logistics_warehouses
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  -- Locations: members can read, admins can write
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_locations' and policyname='logistics_locations_select'
  ) then
    create policy logistics_locations_select
      on public.logistics_locations
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_locations' and policyname='logistics_locations_write'
  ) then
    create policy logistics_locations_write
      on public.logistics_locations
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  -- Stock levels: members can read (write only by DB triggers)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_stock_levels' and policyname='logistics_stock_levels_select'
  ) then
    create policy logistics_stock_levels_select
      on public.logistics_stock_levels
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_stock_levels' and policyname='logistics_stock_levels_write_admin'
  ) then
    create policy logistics_stock_levels_write_admin
      on public.logistics_stock_levels
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  -- Reservations: members can read, admins can write
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_stock_reservations' and policyname='logistics_stock_reservations_select'
  ) then
    create policy logistics_stock_reservations_select
      on public.logistics_stock_reservations
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_stock_reservations' and policyname='logistics_stock_reservations_write'
  ) then
    create policy logistics_stock_reservations_write
      on public.logistics_stock_reservations
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  -- Reorder rules: members can read, admins can write
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_reorder_rules' and policyname='logistics_reorder_rules_select'
  ) then
    create policy logistics_reorder_rules_select
      on public.logistics_reorder_rules
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='logistics_reorder_rules' and policyname='logistics_reorder_rules_write'
  ) then
    create policy logistics_reorder_rules_write
      on public.logistics_reorder_rules
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'logistics'));
  end if;
end
$$;
