-- 040_purchases_core.sql
-- Purchases / Procurement core:
-- - suppliers
-- - purchase orders (bons de commande) + lines
-- - receipts (receptions) that can post stock movements
--
-- Design goals:
-- - Multi-tenant (organization_id everywhere) + RLS
-- - Evolutive (metadata jsonb)
-- - Integrates with inventory via public.stock_movements (003 + 024)
-- - Gated by SaaS module: "purchases"
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Plan bundles: add module "purchases"
-- =========================================================
do $$
begin
  if to_regclass('public.billing_plans') is null then
    return;
  end if;

  -- Enable for enterprise/maximal offers (can be customized later).
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{purchases}', 'true'::jsonb, true),
      updated_at = now()
  where code in ('scale','ultimate');

  -- For other offers: only set default false if the key does not exist yet
  -- (avoid overriding custom setups).
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{purchases}', 'false'::jsonb, true),
      updated_at = now()
  where code in ('starter','growth','transport','restaurant','rental')
    and not (coalesce(modules, '{}'::jsonb) ? 'purchases');

  -- Refresh entitlements for existing subscriptions so the new module flag is applied immediately.
  if to_regclass('public.organization_subscriptions') is not null then
    update public.organization_subscriptions
    set status = status
    where id is not null;
  end if;
end
$$;

-- =========================================================
-- Organization profile defaults (prefix/padding)
-- =========================================================
alter table if exists public.organization_profiles
  add column if not exists purchase_prefix text not null default 'BC';

alter table if exists public.organization_profiles
  add column if not exists purchase_padding int4 not null default 4;

-- =========================================================
-- Numbering sequence per org/year (bon de commande)
-- =========================================================
create table if not exists public.purchase_order_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series text not null default 'BC',
  year int4 not null,
  next_number int4 not null default 1,
  padding int4 not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, series, year)
);

create index if not exists purchase_order_sequences_org_idx
  on public.purchase_order_sequences (organization_id, year desc);

drop trigger if exists trg_touch_purchase_order_sequences on public.purchase_order_sequences;
create trigger trg_touch_purchase_order_sequences
before update on public.purchase_order_sequences
for each row execute function app.touch_updated_at();

create or replace function app.next_purchase_order_reference(p_org uuid, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _d date;
  _year int;
  _series text;
  _pad int;
  _seq public.purchase_order_sequences;
  _num int;
begin
  _org := coalesce(p_org, app.current_organization_id());
  if _org is null then
    raise exception 'organization_id_required';
  end if;

  _d := coalesce(p_date, current_date);
  _year := extract(year from _d)::int;

  select
    coalesce(nullif(trim(op.purchase_prefix), ''), 'BC'),
    greatest(1, coalesce(op.purchase_padding, 4))
  into _series, _pad
  from public.organization_profiles op
  where op.organization_id = _org;

  if _series is null then _series := 'BC'; end if;
  if _pad is null then _pad := 4; end if;

  insert into public.purchase_order_sequences (organization_id, series, year, next_number, padding)
  values (_org, _series, _year, 1, _pad)
  on conflict (organization_id, series, year) do nothing;

  select *
  into _seq
  from public.purchase_order_sequences
  where organization_id = _org and series = _series and year = _year
  for update;

  _num := _seq.next_number;

  update public.purchase_order_sequences
  set next_number = _seq.next_number + 1,
      padding = greatest(1, coalesce(_seq.padding, _pad)),
      updated_at = now()
  where id = _seq.id;

  return _series || '-' || _year::text || '-' || lpad(_num::text, greatest(1, coalesce(_seq.padding, _pad)), '0');
end;
$$;

grant execute on function app.next_purchase_order_reference(uuid, date) to authenticated, anon;

-- =========================================================
-- Suppliers
-- =========================================================
create table if not exists public.purchase_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  legal_name text,
  vat_number text,
  siret text,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  country text not null default 'FR',
  contact_name text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_suppliers_org_code_uidx
  on public.purchase_suppliers (organization_id, code)
  where code is not null and code <> '';

create index if not exists purchase_suppliers_org_idx
  on public.purchase_suppliers (organization_id, is_active, name);

drop trigger if exists trg_fill_organization_id on public.purchase_suppliers;
create trigger trg_fill_organization_id
before insert on public.purchase_suppliers
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_purchase_suppliers on public.purchase_suppliers;
create trigger trg_touch_purchase_suppliers
before update on public.purchase_suppliers
for each row execute function app.touch_updated_at();

-- =========================================================
-- Purchase orders + lines
-- =========================================================
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.purchase_suppliers(id) on delete set null,

  reference text,
  status text not null default 'draft',
  issue_date date,
  expected_date date,
  currency text not null default 'EUR',

  notes text,
  terms text,

  subtotal_cents int8 not null default 0,
  vat_cents int8 not null default 0,
  total_cents int8 not null default 0,

  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.purchase_orders add column if not exists sent_at timestamptz;
alter table if exists public.purchase_orders add column if not exists confirmed_at timestamptz;
alter table if exists public.purchase_orders add column if not exists received_at timestamptz;
alter table if exists public.purchase_orders add column if not exists canceled_at timestamptz;

do $$
begin
  if to_regclass('public.purchase_orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'purchase_orders_status_chk'
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_status_chk
      check (status in ('draft','sent','confirmed','partially_received','received','canceled')) not valid;
  end if;
end
$$;

create unique index if not exists purchase_orders_org_reference_uidx
  on public.purchase_orders (organization_id, reference)
  where reference is not null and reference <> '';

create index if not exists purchase_orders_org_idx
  on public.purchase_orders (organization_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.purchase_orders;
create trigger trg_fill_organization_id
before insert on public.purchase_orders
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_purchase_orders on public.purchase_orders;
create trigger trg_touch_purchase_orders
before update on public.purchase_orders
for each row execute function app.touch_updated_at();

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  sort_order int4 not null default 0,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  unit text not null default 'u',
  qty_ordered int4 not null default 1,
  qty_received int4 not null default 0,
  unit_cost_cents int8 not null default 0,
  vat_rate numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.purchase_order_lines') is not null and not exists (
    select 1 from pg_constraint where conname = 'purchase_order_lines_qty_chk'
  ) then
    alter table public.purchase_order_lines
      add constraint purchase_order_lines_qty_chk
      check (qty_ordered > 0 and qty_received >= 0) not valid;
  end if;
end
$$;

create index if not exists purchase_order_lines_po_idx
  on public.purchase_order_lines (purchase_order_id, sort_order, created_at);

create index if not exists purchase_order_lines_org_product_idx
  on public.purchase_order_lines (organization_id, product_id);

drop trigger if exists trg_fill_organization_id on public.purchase_order_lines;
create trigger trg_fill_organization_id
before insert on public.purchase_order_lines
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_purchase_order_lines on public.purchase_order_lines;
create trigger trg_touch_purchase_order_lines
before update on public.purchase_order_lines
for each row execute function app.touch_updated_at();

-- Tenant-safe reference integrity for supplier/product/po links.
create or replace function app.refcheck_purchase_orders()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _supplier_org uuid;
begin
  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;

  if new.status is null then
    new.status := 'draft';
  end if;

  if new.supplier_id is not null then
    select organization_id into _supplier_org
    from public.purchase_suppliers
    where id = new.supplier_id;
    if _supplier_org is null then
      raise exception 'purchase_orders: supplier_id not found or not visible';
    end if;
    if _supplier_org <> new.organization_id then
      raise exception 'purchase_orders: supplier organization mismatch';
    end if;
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  -- Status-based numbering (sequential when leaving draft).
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      if new.issue_date is null then new.issue_date := current_date; end if;
      if new.reference is null or nullif(trim(new.reference), '') is null then
        new.reference := app.next_purchase_order_reference(new.organization_id, new.issue_date);
      end if;
      if new.status = 'sent' then new.sent_at := coalesce(new.sent_at, now()); end if;
      if new.status = 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now()); end if;
      if new.status = 'received' then new.received_at := coalesce(new.received_at, now()); end if;
      if new.status = 'canceled' then new.canceled_at := coalesce(new.canceled_at, now()); end if;
    end if;
    return new;
  end if;

  if coalesce(old.status, 'draft') = 'draft' and new.status <> 'draft' then
    if new.issue_date is null then new.issue_date := current_date; end if;
    if new.reference is null or nullif(trim(new.reference), '') is null then
      new.reference := app.next_purchase_order_reference(new.organization_id, new.issue_date);
    end if;
  end if;

  if coalesce(old.status, '') <> 'sent' and new.status = 'sent' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  if coalesce(old.status, '') <> 'confirmed' and new.status = 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  if coalesce(old.status, '') <> 'received' and new.status = 'received' then
    new.received_at := coalesce(new.received_at, now());
  end if;
  if coalesce(old.status, '') <> 'canceled' and new.status = 'canceled' then
    new.canceled_at := coalesce(new.canceled_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_purchase_orders on public.purchase_orders;
create trigger trg_refcheck_purchase_orders
before insert or update on public.purchase_orders
for each row execute function app.refcheck_purchase_orders();

create or replace function app.refcheck_purchase_order_lines()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _po_org uuid;
  _product_org uuid;
begin
  select organization_id into _po_org
  from public.purchase_orders
  where id = new.purchase_order_id;

  if _po_org is null then
    raise exception 'purchase_order_lines: purchase_order_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _po_org;
  end if;

  if new.organization_id <> _po_org then
    raise exception 'purchase_order_lines: organization mismatch';
  end if;

  if new.product_id is not null then
    select organization_id into _product_org
    from public.products
    where id = new.product_id;
    if _product_org is null then
      raise exception 'purchase_order_lines: product_id not found or not visible';
    end if;
    if _product_org <> new.organization_id then
      raise exception 'purchase_order_lines: product organization mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_purchase_order_lines on public.purchase_order_lines;
create trigger trg_refcheck_purchase_order_lines
before insert or update on public.purchase_order_lines
for each row execute function app.refcheck_purchase_order_lines();

-- Totals helper.
create or replace function app.recalc_purchase_order_totals(p_po uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _sub int8;
  _vat int8;
  _total int8;
begin
  if p_po is null then
    return;
  end if;

  select
    coalesce(sum(greatest(0, coalesce(l.qty_ordered, 0))::int8 * greatest(0, coalesce(l.unit_cost_cents, 0))), 0)::int8 as subtotal,
    coalesce(sum(
      round(
        (greatest(0, coalesce(l.qty_ordered, 0))::numeric * greatest(0, coalesce(l.unit_cost_cents, 0))::numeric)
        * (coalesce(l.vat_rate, 0)::numeric / 100.0)
      )
    ), 0)::int8 as vat
  into _sub, _vat
  from public.purchase_order_lines l
  where l.purchase_order_id = p_po;

  _sub := coalesce(_sub, 0);
  _vat := coalesce(_vat, 0);
  _total := greatest(0, _sub + _vat);

  update public.purchase_orders
  set subtotal_cents = _sub,
      vat_cents = _vat,
      total_cents = _total,
      updated_at = now()
  where id = p_po;
end;
$$;

grant execute on function app.recalc_purchase_order_totals(uuid) to authenticated, anon;

create or replace function app.on_purchase_order_lines_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app.recalc_purchase_order_totals(coalesce(new.purchase_order_id, old.purchase_order_id));
  return coalesce(new, old);
end;
$$;

grant execute on function app.on_purchase_order_lines_write() to authenticated, anon;

drop trigger if exists trg_purchase_order_lines_recalc on public.purchase_order_lines;
create trigger trg_purchase_order_lines_recalc
after insert or update or delete on public.purchase_order_lines
for each row execute function app.on_purchase_order_lines_write();

-- =========================================================
-- Receipts (receptions) + posting to stock movements
-- =========================================================
create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  status text not null default 'draft',
  received_at date not null default current_date,
  notes text,
  created_by uuid,
  posted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.purchase_receipts') is not null and not exists (
    select 1 from pg_constraint where conname = 'purchase_receipts_status_chk'
  ) then
    alter table public.purchase_receipts
      add constraint purchase_receipts_status_chk
      check (status in ('draft','posted','canceled')) not valid;
  end if;
end
$$;

create index if not exists purchase_receipts_po_idx
  on public.purchase_receipts (purchase_order_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.purchase_receipts;
create trigger trg_fill_organization_id
before insert on public.purchase_receipts
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_purchase_receipts on public.purchase_receipts;
create trigger trg_touch_purchase_receipts
before update on public.purchase_receipts
for each row execute function app.touch_updated_at();

create or replace function app.refcheck_purchase_receipts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _po_org uuid;
begin
  select organization_id into _po_org
  from public.purchase_orders
  where id = new.purchase_order_id;

  if _po_org is null then
    raise exception 'purchase_receipts: purchase_order_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _po_org;
  end if;

  if new.organization_id <> _po_org then
    raise exception 'purchase_receipts: organization mismatch';
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_purchase_receipts on public.purchase_receipts;
create trigger trg_refcheck_purchase_receipts
before insert or update on public.purchase_receipts
for each row execute function app.refcheck_purchase_receipts();

create table if not exists public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text,
  unit text not null default 'u',
  qty_received int4 not null default 1,
  unit_cost_cents int8 not null default 0,
  vat_rate numeric not null default 0,
  warehouse_id uuid references public.logistics_warehouses(id) on delete set null,
  location_id uuid references public.logistics_locations(id) on delete set null,
  stock_movement_id uuid references public.stock_movements(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.purchase_receipt_lines') is not null and not exists (
    select 1 from pg_constraint where conname = 'purchase_receipt_lines_qty_chk'
  ) then
    alter table public.purchase_receipt_lines
      add constraint purchase_receipt_lines_qty_chk
      check (qty_received > 0) not valid;
  end if;
end
$$;

create index if not exists purchase_receipt_lines_receipt_idx
  on public.purchase_receipt_lines (receipt_id, created_at);

drop trigger if exists trg_fill_organization_id on public.purchase_receipt_lines;
create trigger trg_fill_organization_id
before insert on public.purchase_receipt_lines
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_purchase_receipt_lines on public.purchase_receipt_lines;
create trigger trg_touch_purchase_receipt_lines
before update on public.purchase_receipt_lines
for each row execute function app.touch_updated_at();

create or replace function app.refcheck_purchase_receipt_lines()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _r public.purchase_receipts;
  _po public.purchase_orders;
  _line public.purchase_order_lines;
  _product_org uuid;
begin
  select * into _r from public.purchase_receipts where id = new.receipt_id;
  if _r.id is null then
    raise exception 'purchase_receipt_lines: receipt_id not found or not visible';
  end if;

  if new.organization_id is null then
    new.organization_id := _r.organization_id;
  end if;

  if new.organization_id <> _r.organization_id then
    raise exception 'purchase_receipt_lines: organization mismatch';
  end if;

  select * into _po from public.purchase_orders where id = _r.purchase_order_id;
  if _po.id is null then
    raise exception 'purchase_receipt_lines: purchase order not found';
  end if;

  if new.purchase_order_line_id is not null then
    select * into _line from public.purchase_order_lines where id = new.purchase_order_line_id;
    if _line.id is null then
      raise exception 'purchase_receipt_lines: purchase_order_line_id not found or not visible';
    end if;
    if _line.purchase_order_id <> _po.id then
      raise exception 'purchase_receipt_lines: line does not belong to purchase order';
    end if;
    if new.product_id is null then
      new.product_id := _line.product_id;
    end if;
    if new.description is null or btrim(new.description) = '' then
      new.description := _line.description;
    end if;
    if new.unit_cost_cents is null or new.unit_cost_cents = 0 then
      new.unit_cost_cents := _line.unit_cost_cents;
    end if;
    if new.vat_rate is null then
      new.vat_rate := _line.vat_rate;
    end if;
    if new.unit is null or btrim(new.unit) = '' then
      new.unit := _line.unit;
    end if;
  end if;

  if new.product_id is not null then
    select organization_id into _product_org
    from public.products
    where id = new.product_id;
    if _product_org is null then
      raise exception 'purchase_receipt_lines: product_id not found or not visible';
    end if;
    if _product_org <> new.organization_id then
      raise exception 'purchase_receipt_lines: product organization mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refcheck_purchase_receipt_lines on public.purchase_receipt_lines;
create trigger trg_refcheck_purchase_receipt_lines
before insert or update on public.purchase_receipt_lines
for each row execute function app.refcheck_purchase_receipt_lines();

-- Posting: create stock movements + update received quantities + rollup PO status.
create or replace function app.post_purchase_receipt(p_receipt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _r public.purchase_receipts;
  _po public.purchase_orders;
  _has_logistics boolean;
  _default_wh uuid;
  _default_loc uuid;
  _line_id uuid;
  _movement_id uuid;
  _updated_lines int;
begin
  if p_receipt is null then
    raise exception 'receipt_id_required';
  end if;

  select * into _r
  from public.purchase_receipts
  where id = p_receipt
  for update;

  if _r.id is null then
    raise exception 'receipt_not_found';
  end if;

  if _r.status = 'posted' then
    -- idempotent
    return;
  end if;

  if _r.status = 'canceled' then
    raise exception 'receipt_canceled';
  end if;

  select * into _po
  from public.purchase_orders
  where id = _r.purchase_order_id;

  if _po.id is null then
    raise exception 'purchase_order_not_found';
  end if;

  _has_logistics := app.org_has_module(_r.organization_id, 'logistics');

  if _has_logistics then
    select w.id into _default_wh
    from public.logistics_warehouses w
    where w.organization_id = _r.organization_id
      and w.is_active = true
    order by w.is_default desc, w.created_at asc
    limit 1;

    if _default_wh is not null then
      select l.id into _default_loc
      from public.logistics_locations l
      where l.warehouse_id = _default_wh
        and l.code = 'RECEIVING'
      order by l.created_at asc
      limit 1;
    end if;
  end if;

  -- 1) Create stock movements for each receipt line (if product_id exists and not yet posted).
  for _line_id in
    select id from public.purchase_receipt_lines
    where receipt_id = _r.id
      and product_id is not null
      and stock_movement_id is null
  loop
    declare
      _l public.purchase_receipt_lines;
      _wh uuid;
      _loc uuid;
    begin
      select * into _l from public.purchase_receipt_lines where id = _line_id for update;

      _wh := coalesce(_l.warehouse_id, _default_wh);
      _loc := coalesce(_l.location_id, _default_loc);

      insert into public.stock_movements (
        organization_id,
        product_id,
        intervention_id,
        movement_type,
        qty,
        reason,
        created_by,
        warehouse_id,
        location_id,
        metadata,
        created_at
      )
      values (
        _r.organization_id,
        _l.product_id,
        null,
        'in',
        abs(coalesce(_l.qty_received, 0)),
        'Réception achat',
        auth.uid(),
        _wh,
        _loc,
        jsonb_build_object(
          'purchase_receipt_id', _r.id,
          'purchase_order_id', _po.id,
          'purchase_order_line_id', _l.purchase_order_line_id
        ),
        now()
      )
      returning id into _movement_id;

      update public.purchase_receipt_lines
      set stock_movement_id = _movement_id,
          updated_at = now()
      where id = _l.id;
    end;
  end loop;

  -- 2) Rollup received quantities on purchase_order_lines.
  update public.purchase_order_lines pol
  set qty_received = greatest(
        0,
        coalesce(pol.qty_received, 0) + coalesce(x.delta, 0)
      ),
      updated_at = now()
  from (
    select
      l.purchase_order_line_id as line_id,
      sum(abs(coalesce(l.qty_received, 0)))::int4 as delta
    from public.purchase_receipt_lines l
    where l.receipt_id = _r.id
      and l.purchase_order_line_id is not null
    group by l.purchase_order_line_id
  ) x
  where pol.id = x.line_id;

  get diagnostics _updated_lines = row_count;

  -- 3) Update purchase order status.
  update public.purchase_orders po
  set status = case
        when po.status = 'canceled' then po.status
        when exists (
          select 1
          from public.purchase_order_lines l
          where l.purchase_order_id = po.id
            and coalesce(l.qty_received, 0) < coalesce(l.qty_ordered, 0)
        ) and exists (
          select 1
          from public.purchase_order_lines l2
          where l2.purchase_order_id = po.id
            and coalesce(l2.qty_received, 0) > 0
        ) then 'partially_received'
        when exists (
          select 1
          from public.purchase_order_lines l3
          where l3.purchase_order_id = po.id
        ) and not exists (
          select 1
          from public.purchase_order_lines l4
          where l4.purchase_order_id = po.id
            and coalesce(l4.qty_received, 0) < coalesce(l4.qty_ordered, 0)
        ) then 'received'
        else po.status
      end,
      updated_at = now()
  where po.id = _po.id;

  update public.purchase_receipts
  set status = 'posted',
      posted_at = now(),
      updated_at = now()
  where id = _r.id;
end;
$$;

grant execute on function app.post_purchase_receipt(uuid) to authenticated;

-- =========================================================
-- RLS (gated by module "purchases")
-- =========================================================
alter table public.purchase_order_sequences enable row level security;
alter table public.purchase_order_sequences force row level security;
alter table public.purchase_suppliers enable row level security;
alter table public.purchase_suppliers force row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_lines force row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipts force row level security;
alter table public.purchase_receipt_lines enable row level security;
alter table public.purchase_receipt_lines force row level security;

do $$
begin
  -- Sequences: members can use (needed for numbering), admins can manage
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_sequences' and policyname='purchase_order_sequences_select_admin'
  ) then
    create policy purchase_order_sequences_select_admin
      on public.purchase_order_sequences
      for select
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_sequences' and policyname='purchase_order_sequences_select_member'
  ) then
    create policy purchase_order_sequences_select_member
      on public.purchase_order_sequences
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_sequences' and policyname='purchase_order_sequences_write_admin'
  ) then
    create policy purchase_order_sequences_write_admin
      on public.purchase_order_sequences
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_sequences' and policyname='purchase_order_sequences_insert_member'
  ) then
    create policy purchase_order_sequences_insert_member
      on public.purchase_order_sequences
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_sequences' and policyname='purchase_order_sequences_update_member'
  ) then
    create policy purchase_order_sequences_update_member
      on public.purchase_order_sequences
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  -- Suppliers: members read/write, delete reserved to admins
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_suppliers' and policyname='purchase_suppliers_select'
  ) then
    create policy purchase_suppliers_select
      on public.purchase_suppliers
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_suppliers' and policyname='purchase_suppliers_insert_member'
  ) then
    create policy purchase_suppliers_insert_member
      on public.purchase_suppliers
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_suppliers' and policyname='purchase_suppliers_update_member'
  ) then
    create policy purchase_suppliers_update_member
      on public.purchase_suppliers
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_suppliers' and policyname='purchase_suppliers_write_admin'
  ) then
    create policy purchase_suppliers_write_admin
      on public.purchase_suppliers
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_suppliers' and policyname='purchase_suppliers_delete_admin'
  ) then
    create policy purchase_suppliers_delete_admin
      on public.purchase_suppliers
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  -- Purchase orders + lines: members read/write, delete reserved to admins
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_select'
  ) then
    create policy purchase_orders_select
      on public.purchase_orders
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_insert_member'
  ) then
    create policy purchase_orders_insert_member
      on public.purchase_orders
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_update_member'
  ) then
    create policy purchase_orders_update_member
      on public.purchase_orders
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_write_admin'
  ) then
    create policy purchase_orders_write_admin
      on public.purchase_orders
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_orders' and policyname='purchase_orders_delete_admin'
  ) then
    create policy purchase_orders_delete_admin
      on public.purchase_orders
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_lines' and policyname='purchase_order_lines_select'
  ) then
    create policy purchase_order_lines_select
      on public.purchase_order_lines
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_lines' and policyname='purchase_order_lines_insert_member'
  ) then
    create policy purchase_order_lines_insert_member
      on public.purchase_order_lines
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_lines' and policyname='purchase_order_lines_update_member'
  ) then
    create policy purchase_order_lines_update_member
      on public.purchase_order_lines
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_lines' and policyname='purchase_order_lines_write_admin'
  ) then
    create policy purchase_order_lines_write_admin
      on public.purchase_order_lines
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_order_lines' and policyname='purchase_order_lines_delete_admin'
  ) then
    create policy purchase_order_lines_delete_admin
      on public.purchase_order_lines
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  -- Receipts: members read/write, delete reserved to admins
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipts' and policyname='purchase_receipts_select'
  ) then
    create policy purchase_receipts_select
      on public.purchase_receipts
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipts' and policyname='purchase_receipts_insert_member'
  ) then
    create policy purchase_receipts_insert_member
      on public.purchase_receipts
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipts' and policyname='purchase_receipts_update_member'
  ) then
    create policy purchase_receipts_update_member
      on public.purchase_receipts
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipts' and policyname='purchase_receipts_write_admin'
  ) then
    create policy purchase_receipts_write_admin
      on public.purchase_receipts
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipts' and policyname='purchase_receipts_delete_admin'
  ) then
    create policy purchase_receipts_delete_admin
      on public.purchase_receipts
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipt_lines' and policyname='purchase_receipt_lines_select'
  ) then
    create policy purchase_receipt_lines_select
      on public.purchase_receipt_lines
      for select
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipt_lines' and policyname='purchase_receipt_lines_insert_member'
  ) then
    create policy purchase_receipt_lines_insert_member
      on public.purchase_receipt_lines
      for insert
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipt_lines' and policyname='purchase_receipt_lines_update_member'
  ) then
    create policy purchase_receipt_lines_update_member
      on public.purchase_receipt_lines
      for update
      using (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_member(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipt_lines' and policyname='purchase_receipt_lines_write_admin'
  ) then
    create policy purchase_receipt_lines_write_admin
      on public.purchase_receipt_lines
      for all
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'))
      with check (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='purchase_receipt_lines' and policyname='purchase_receipt_lines_delete_admin'
  ) then
    create policy purchase_receipt_lines_delete_admin
      on public.purchase_receipt_lines
      for delete
      using (app.is_org_admin(organization_id) and app.org_has_module(organization_id,'purchases'));
  end if;
end
$$;
