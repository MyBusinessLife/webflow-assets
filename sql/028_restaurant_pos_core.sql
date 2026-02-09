-- 028_restaurant_pos_core.sql
-- Module restauration + commandes QR + POS unifie (produits + menus)
-- + traçabilité stock via recettes menu -> produits.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =============================================
-- 0) Module bundle on plans
-- =============================================

alter table if exists public.billing_plans
  add column if not exists modules jsonb not null default '{}'::jsonb;

update public.billing_plans
set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{restaurant}', 'false'::jsonb, true),
    updated_at = now()
where code in ('starter', 'growth', 'transport')
  and coalesce((modules ->> 'restaurant')::boolean, false) is distinct from false;

update public.billing_plans
set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{restaurant}', 'true'::jsonb, true),
    updated_at = now()
where code in ('scale', 'ultimate')
  and coalesce((modules ->> 'restaurant')::boolean, false) is distinct from true;

-- =============================================
-- 1) Core tables (restaurant catalog + orders)
-- =============================================

create table if not exists public.restaurant_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  public_page_path text not null default '/restaurant-order',
  public_query_key text not null default 'loc',
  public_is_open boolean not null default true,
  service_mode text not null default 'mixed', -- table|counter|mixed
  currency text not null default 'EUR',
  is_active boolean not null default true,
  notes text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.restaurant_menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.restaurant_locations(id) on delete cascade,
  name text not null,
  description text,
  sort_order int4 not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.restaurant_locations(id) on delete cascade,
  category_id uuid references public.restaurant_menu_categories(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  description text,
  price_cents int8 not null default 0,
  vat_rate numeric not null default 10,
  prep_minutes int4,
  image_url text,
  allergen_tags text[] not null default '{}',
  available_for_qr boolean not null default true,
  available_for_pos boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_item_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  menu_item_id uuid not null references public.restaurant_menu_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  qty numeric(12,3) not null,
  unit text,
  waste_percent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, product_id)
);

create table if not exists public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.restaurant_locations(id) on delete set null,
  reference text,
  source text not null default 'qr', -- qr|pos|kiosk|manual
  status text not null default 'new', -- new|confirmed|preparing|ready|served|completed|canceled
  payment_status text not null default 'unpaid', -- unpaid|partially_paid|paid|refunded
  table_label text,
  customer_name text,
  customer_phone text,
  note text,
  subtotal_cents int8 not null default 0,
  vat_cents int8 not null default 0,
  total_cents int8 not null default 0,
  currency text not null default 'EUR',
  stock_applied boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  line_type text not null default 'menu_item', -- menu_item|product|custom
  menu_item_id uuid references public.restaurant_menu_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  label text not null,
  qty numeric(12,3) not null default 1,
  unit_price_cents int8 not null default 0,
  vat_rate numeric not null default 10,
  total_cents int8 not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- constraints (idempotent)
do $$
begin
  if to_regclass('public.restaurant_locations') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_locations_service_mode_check'
  ) then
    alter table public.restaurant_locations
      add constraint restaurant_locations_service_mode_check
      check (service_mode in ('table','counter','mixed')) not valid;
  end if;

  if to_regclass('public.restaurant_menu_items') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_menu_items_price_check'
  ) then
    alter table public.restaurant_menu_items
      add constraint restaurant_menu_items_price_check
      check (price_cents >= 0 and vat_rate >= 0 and vat_rate <= 100) not valid;
  end if;

  if to_regclass('public.restaurant_item_recipes') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_item_recipes_qty_check'
  ) then
    alter table public.restaurant_item_recipes
      add constraint restaurant_item_recipes_qty_check
      check (qty > 0 and waste_percent >= 0 and waste_percent <= 100) not valid;
  end if;

  if to_regclass('public.restaurant_orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_orders_source_check'
  ) then
    alter table public.restaurant_orders
      add constraint restaurant_orders_source_check
      check (source in ('qr','pos','kiosk','manual')) not valid;
  end if;

  if to_regclass('public.restaurant_orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_orders_status_check'
  ) then
    alter table public.restaurant_orders
      add constraint restaurant_orders_status_check
      check (status in ('new','confirmed','preparing','ready','served','completed','canceled')) not valid;
  end if;

  if to_regclass('public.restaurant_orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_orders_payment_status_check'
  ) then
    alter table public.restaurant_orders
      add constraint restaurant_orders_payment_status_check
      check (payment_status in ('unpaid','partially_paid','paid','refunded')) not valid;
  end if;

  if to_regclass('public.restaurant_order_lines') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_order_lines_type_check'
  ) then
    alter table public.restaurant_order_lines
      add constraint restaurant_order_lines_type_check
      check (line_type in ('menu_item','product','custom')) not valid;
  end if;

  if to_regclass('public.restaurant_order_lines') is not null and not exists (
    select 1 from pg_constraint where conname = 'restaurant_order_lines_qty_check'
  ) then
    alter table public.restaurant_order_lines
      add constraint restaurant_order_lines_qty_check
      check (qty > 0 and unit_price_cents >= 0 and vat_rate >= 0 and vat_rate <= 100) not valid;
  end if;
end
$$;

-- indexes
create index if not exists restaurant_locations_org_active_idx
  on public.restaurant_locations (organization_id, is_active, name);

create index if not exists restaurant_menu_categories_org_loc_sort_idx
  on public.restaurant_menu_categories (organization_id, location_id, sort_order, name);

create index if not exists restaurant_menu_items_org_loc_active_idx
  on public.restaurant_menu_items (organization_id, location_id, is_active, name);

create index if not exists restaurant_menu_items_category_idx
  on public.restaurant_menu_items (category_id, name);

create index if not exists restaurant_item_recipes_org_item_idx
  on public.restaurant_item_recipes (organization_id, menu_item_id, product_id);

create index if not exists restaurant_orders_org_created_idx
  on public.restaurant_orders (organization_id, created_at desc);

create index if not exists restaurant_orders_org_status_idx
  on public.restaurant_orders (organization_id, status, created_at desc);

create unique index if not exists restaurant_orders_org_ref_uidx
  on public.restaurant_orders (organization_id, reference)
  where reference is not null and reference <> '';

create index if not exists restaurant_order_lines_org_order_idx
  on public.restaurant_order_lines (organization_id, order_id, created_at asc);

-- triggers: fill organization_id + updated_at

drop trigger if exists trg_fill_organization_id on public.restaurant_locations;
create trigger trg_fill_organization_id
before insert on public.restaurant_locations
for each row execute function app.fill_organization_id();

drop trigger if exists trg_fill_organization_id on public.restaurant_menu_categories;
create trigger trg_fill_organization_id
before insert on public.restaurant_menu_categories
for each row execute function app.fill_organization_id();

drop trigger if exists trg_fill_organization_id on public.restaurant_menu_items;
create trigger trg_fill_organization_id
before insert on public.restaurant_menu_items
for each row execute function app.fill_organization_id();

drop trigger if exists trg_fill_organization_id on public.restaurant_item_recipes;
create trigger trg_fill_organization_id
before insert on public.restaurant_item_recipes
for each row execute function app.fill_organization_id();

drop trigger if exists trg_fill_organization_id on public.restaurant_orders;
create trigger trg_fill_organization_id
before insert on public.restaurant_orders
for each row execute function app.fill_organization_id();

drop trigger if exists trg_fill_organization_id on public.restaurant_order_lines;
create trigger trg_fill_organization_id
before insert on public.restaurant_order_lines
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_restaurant_locations on public.restaurant_locations;
create trigger trg_touch_restaurant_locations
before update on public.restaurant_locations
for each row execute function app.touch_updated_at();

drop trigger if exists trg_touch_restaurant_menu_categories on public.restaurant_menu_categories;
create trigger trg_touch_restaurant_menu_categories
before update on public.restaurant_menu_categories
for each row execute function app.touch_updated_at();

drop trigger if exists trg_touch_restaurant_menu_items on public.restaurant_menu_items;
create trigger trg_touch_restaurant_menu_items
before update on public.restaurant_menu_items
for each row execute function app.touch_updated_at();

drop trigger if exists trg_touch_restaurant_item_recipes on public.restaurant_item_recipes;
create trigger trg_touch_restaurant_item_recipes
before update on public.restaurant_item_recipes
for each row execute function app.touch_updated_at();

drop trigger if exists trg_touch_restaurant_orders on public.restaurant_orders;
create trigger trg_touch_restaurant_orders
before update on public.restaurant_orders
for each row execute function app.touch_updated_at();

drop trigger if exists trg_touch_restaurant_order_lines on public.restaurant_order_lines;
create trigger trg_touch_restaurant_order_lines
before update on public.restaurant_order_lines
for each row execute function app.touch_updated_at();

-- =============================================
-- 2) Business functions
-- =============================================

create or replace function app.next_restaurant_order_reference(p_org uuid, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _seq int8;
begin
  if p_org is null then
    return null;
  end if;

  select coalesce(count(*), 0) + 1
  into _seq
  from public.restaurant_orders ro
  where ro.organization_id = p_org
    and ro.created_at::date = coalesce(p_date, current_date);

  return 'RC-' || to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || lpad(_seq::text, 4, '0');
end;
$$;

grant execute on function app.next_restaurant_order_reference(uuid, date) to authenticated, anon;

create or replace function app.restaurant_orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _loc_org uuid;
begin
  if new.location_id is not null then
    select l.organization_id into _loc_org
    from public.restaurant_locations l
    where l.id = new.location_id
    limit 1;

    if _loc_org is null then
      raise exception 'restaurant_orders: location_id invalide';
    end if;

    if new.organization_id is null then
      new.organization_id := _loc_org;
    elsif new.organization_id <> _loc_org then
      raise exception 'restaurant_orders: organization_id mismatch with location';
    end if;
  end if;

  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;

  if coalesce(nullif(new.reference, ''), '') = '' then
    new.reference := app.next_restaurant_order_reference(new.organization_id, current_date);
  end if;

  return new;
end;
$$;

grant execute on function app.restaurant_orders_before_write() to authenticated, anon;

drop trigger if exists trg_restaurant_orders_before_write on public.restaurant_orders;
create trigger trg_restaurant_orders_before_write
before insert or update on public.restaurant_orders
for each row execute function app.restaurant_orders_before_write();

create or replace function app.restaurant_order_lines_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _item record;
  _product record;
begin
  select ro.organization_id into _org
  from public.restaurant_orders ro
  where ro.id = new.order_id;

  if _org is null then
    raise exception 'restaurant_order_lines: order_id invalide';
  end if;

  new.organization_id := _org;
  new.qty := greatest(coalesce(new.qty, 1), 0.001);

  if new.line_type = 'menu_item' then
    if new.menu_item_id is null then
      raise exception 'restaurant_order_lines: menu_item_id requis pour line_type=menu_item';
    end if;

    select i.* into _item
    from public.restaurant_menu_items i
    where i.id = new.menu_item_id
      and i.organization_id = _org
    limit 1;

    if _item.id is null then
      raise exception 'restaurant_order_lines: menu_item invalide ou inaccessible';
    end if;

    new.label := coalesce(nullif(new.label, ''), _item.name);
    new.unit_price_cents := coalesce(new.unit_price_cents, _item.price_cents, 0);
    new.vat_rate := coalesce(new.vat_rate, _item.vat_rate, 10);

  elsif new.line_type = 'product' then
    if new.product_id is null then
      raise exception 'restaurant_order_lines: product_id requis pour line_type=product';
    end if;

    select p.* into _product
    from public.products p
    where p.id = new.product_id
      and p.organization_id = _org
    limit 1;

    if _product.id is null then
      raise exception 'restaurant_order_lines: product invalide ou inaccessible';
    end if;

    new.label := coalesce(nullif(new.label, ''), _product.name);
    new.unit_price_cents := coalesce(new.unit_price_cents, _product.price_cents, 0);
    new.vat_rate := coalesce(new.vat_rate, 20);

  else
    new.label := coalesce(nullif(new.label, ''), 'Article');
    new.unit_price_cents := greatest(coalesce(new.unit_price_cents, 0), 0);
    new.vat_rate := coalesce(new.vat_rate, 20);
  end if;

  new.total_cents := round(new.qty * new.unit_price_cents)::bigint;

  return new;
end;
$$;

grant execute on function app.restaurant_order_lines_before_write() to authenticated, anon;

drop trigger if exists trg_restaurant_order_lines_before_write on public.restaurant_order_lines;
create trigger trg_restaurant_order_lines_before_write
before insert or update on public.restaurant_order_lines
for each row execute function app.restaurant_order_lines_before_write();

create or replace function app.recalc_restaurant_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _subtotal int8 := 0;
  _vat int8 := 0;
  _total int8 := 0;
begin
  if p_order_id is null then
    return;
  end if;

  select
    coalesce(sum(l.total_cents), 0)::bigint,
    coalesce(sum(round(l.total_cents * coalesce(l.vat_rate, 0) / 100.0)), 0)::bigint
  into _subtotal, _vat
  from public.restaurant_order_lines l
  where l.order_id = p_order_id;

  _total := _subtotal + _vat;

  update public.restaurant_orders
  set subtotal_cents = _subtotal,
      vat_cents = _vat,
      total_cents = _total,
      updated_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function app.recalc_restaurant_order(uuid) to authenticated, anon;

create or replace function app.restaurant_order_lines_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _order_id uuid;
begin
  _order_id := coalesce(new.order_id, old.order_id);
  perform app.recalc_restaurant_order(_order_id);
  return coalesce(new, old);
end;
$$;

grant execute on function app.restaurant_order_lines_after_write() to authenticated, anon;

drop trigger if exists trg_restaurant_order_lines_after_write on public.restaurant_order_lines;
create trigger trg_restaurant_order_lines_after_write
after insert or update or delete on public.restaurant_order_lines
for each row execute function app.restaurant_order_lines_after_write();

create or replace function app.apply_restaurant_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _ord record;
  _line record;
  _rec record;
  _qty int4;
  _reason text;
begin
  if p_order_id is null then
    return;
  end if;

  select * into _ord
  from public.restaurant_orders ro
  where ro.id = p_order_id
  limit 1;

  if _ord.id is null then
    return;
  end if;

  if coalesce(_ord.stock_applied, false) then
    return;
  end if;

  _reason := 'Restaurant order ' || coalesce(_ord.reference, _ord.id::text);

  for _line in
    select l.*
    from public.restaurant_order_lines l
    where l.order_id = _ord.id
    order by l.created_at asc, l.id asc
  loop
    if _line.line_type = 'product' and _line.product_id is not null then
      _qty := greatest(0, round(coalesce(_line.qty, 0))::int4);
      if _qty > 0 then
        insert into public.stock_movements (organization_id, product_id, movement_type, qty, reason, created_by, created_at)
        select _ord.organization_id, _line.product_id, 'out', _qty, _reason, _ord.created_by, now()
        where exists (
          select 1
          from public.products p
          where p.id = _line.product_id
            and p.organization_id = _ord.organization_id
        );
      end if;

    elsif _line.line_type = 'menu_item' and _line.menu_item_id is not null then
      for _rec in
        select r.product_id, r.qty, r.waste_percent
        from public.restaurant_item_recipes r
        where r.organization_id = _ord.organization_id
          and r.menu_item_id = _line.menu_item_id
      loop
        _qty := greatest(0, round(coalesce(_line.qty, 0) * coalesce(_rec.qty, 0) * (1 + coalesce(_rec.waste_percent, 0) / 100.0))::int4);
        if _qty > 0 then
          insert into public.stock_movements (organization_id, product_id, movement_type, qty, reason, created_by, created_at)
          select _ord.organization_id, _rec.product_id, 'out', _qty, _reason, _ord.created_by, now()
          where exists (
            select 1
            from public.products p
            where p.id = _rec.product_id
              and p.organization_id = _ord.organization_id
          );
        end if;
      end loop;
    end if;
  end loop;

  update public.restaurant_orders
  set stock_applied = true,
      updated_at = now()
  where id = _ord.id;
end;
$$;

grant execute on function app.apply_restaurant_order_stock(uuid) to authenticated, anon;

create or replace function app.restaurant_orders_after_status_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.stock_applied, false) = false
     and (
       new.payment_status = 'paid'
       or new.status in ('confirmed','preparing','ready','served','completed')
     ) then
    perform app.apply_restaurant_order_stock(new.id);
  end if;
  return new;
end;
$$;

grant execute on function app.restaurant_orders_after_status_write() to authenticated, anon;

drop trigger if exists trg_restaurant_orders_after_status_write on public.restaurant_orders;
create trigger trg_restaurant_orders_after_status_write
after insert or update of status, payment_status on public.restaurant_orders
for each row execute function app.restaurant_orders_after_status_write();

-- =============================================
-- 3) Public QR catalog + public order creation
-- =============================================

create or replace function app.get_public_restaurant_catalog(p_location_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text := lower(trim(coalesce(p_location_slug, '')));
  _loc record;
  _categories jsonb := '[]'::jsonb;
  _items jsonb := '[]'::jsonb;
begin
  if _slug = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_location_slug');
  end if;

  select l.* into _loc
  from public.restaurant_locations l
  where lower(l.slug) = _slug
    and l.is_active = true
    and l.public_is_open = true
  order by l.created_at asc
  limit 1;

  if _loc.id is null then
    return jsonb_build_object('ok', false, 'error', 'location_not_found');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', c.description,
        'sort_order', c.sort_order
      )
      order by c.sort_order asc, c.name asc
    ),
    '[]'::jsonb
  )
  into _categories
  from public.restaurant_menu_categories c
  where c.organization_id = _loc.organization_id
    and c.location_id = _loc.id
    and c.is_active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'category_id', i.category_id,
        'product_id', i.product_id,
        'name', i.name,
        'description', i.description,
        'price_cents', i.price_cents,
        'vat_rate', i.vat_rate,
        'prep_minutes', i.prep_minutes,
        'image_url', i.image_url,
        'allergen_tags', coalesce(to_jsonb(i.allergen_tags), '[]'::jsonb)
      )
      order by i.name asc
    ),
    '[]'::jsonb
  )
  into _items
  from public.restaurant_menu_items i
  where i.organization_id = _loc.organization_id
    and i.location_id = _loc.id
    and i.is_active = true
    and i.available_for_qr = true;

  return jsonb_build_object(
    'ok', true,
    'location', jsonb_build_object(
      'id', _loc.id,
      'name', _loc.name,
      'slug', _loc.slug,
      'currency', _loc.currency,
      'service_mode', _loc.service_mode,
      'public_page_path', _loc.public_page_path,
      'public_query_key', _loc.public_query_key,
      'notes', _loc.notes
    ),
    'categories', _categories,
    'items', _items
  );
end;
$$;

grant execute on function app.get_public_restaurant_catalog(text) to anon, authenticated;

create or replace function app.create_public_restaurant_order(
  p_location_slug text,
  p_lines jsonb,
  p_table_label text default null,
  p_customer_name text default null,
  p_note text default null,
  p_source text default 'qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text := lower(trim(coalesce(p_location_slug, '')));
  _loc record;
  _order_id uuid;
  _line jsonb;
  _menu_item_id uuid;
  _product_id uuid;
  _qty numeric(12,3);
  _source text := lower(trim(coalesce(p_source, 'qr')));
  _inserted int := 0;
  _item record;
  _product record;
  _order record;
begin
  if _slug = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_location_slug');
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_lines');
  end if;

  select l.* into _loc
  from public.restaurant_locations l
  where lower(l.slug) = _slug
    and l.is_active = true
    and l.public_is_open = true
  order by l.created_at asc
  limit 1;

  if _loc.id is null then
    return jsonb_build_object('ok', false, 'error', 'location_not_found');
  end if;

  if _source not in ('qr','kiosk') then
    _source := 'qr';
  end if;

  insert into public.restaurant_orders (
    organization_id,
    location_id,
    source,
    status,
    payment_status,
    table_label,
    customer_name,
    note,
    currency,
    created_by,
    created_at,
    updated_at
  )
  values (
    _loc.organization_id,
    _loc.id,
    _source,
    'new',
    'unpaid',
    nullif(trim(coalesce(p_table_label, '')), ''),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(_loc.currency, 'EUR'),
    null,
    now(),
    now()
  )
  returning id into _order_id;

  for _line in
    select value from jsonb_array_elements(p_lines)
  loop
    _menu_item_id := null;
    _product_id := null;
    _qty := 1;

    begin
      _menu_item_id := nullif(trim(coalesce(_line ->> 'menu_item_id', '')), '')::uuid;
    exception when others then
      _menu_item_id := null;
    end;

    begin
      _product_id := nullif(trim(coalesce(_line ->> 'product_id', '')), '')::uuid;
    exception when others then
      _product_id := null;
    end;

    begin
      _qty := greatest(coalesce((_line ->> 'qty')::numeric, 1), 0.001);
    exception when others then
      _qty := 1;
    end;

    if _menu_item_id is not null then
      select i.* into _item
      from public.restaurant_menu_items i
      where i.id = _menu_item_id
        and i.organization_id = _loc.organization_id
        and i.location_id = _loc.id
        and i.is_active = true
        and i.available_for_qr = true
      limit 1;

      if _item.id is not null then
        insert into public.restaurant_order_lines (
          organization_id,
          order_id,
          line_type,
          menu_item_id,
          label,
          qty,
          unit_price_cents,
          vat_rate,
          total_cents,
          created_at,
          updated_at
        )
        values (
          _loc.organization_id,
          _order_id,
          'menu_item',
          _item.id,
          _item.name,
          _qty,
          _item.price_cents,
          coalesce(_item.vat_rate, 10),
          round(_qty * _item.price_cents)::bigint,
          now(),
          now()
        );
        _inserted := _inserted + 1;
      end if;

    elsif _product_id is not null then
      select p.* into _product
      from public.products p
      where p.id = _product_id
        and p.organization_id = _loc.organization_id
        and coalesce(p.is_active, true) = true
      limit 1;

      if _product.id is not null then
        insert into public.restaurant_order_lines (
          organization_id,
          order_id,
          line_type,
          product_id,
          label,
          qty,
          unit_price_cents,
          vat_rate,
          total_cents,
          created_at,
          updated_at
        )
        values (
          _loc.organization_id,
          _order_id,
          'product',
          _product.id,
          _product.name,
          _qty,
          coalesce(_product.price_cents, 0),
          20,
          round(_qty * coalesce(_product.price_cents, 0))::bigint,
          now(),
          now()
        );
        _inserted := _inserted + 1;
      end if;
    end if;
  end loop;

  if _inserted = 0 then
    delete from public.restaurant_orders where id = _order_id;
    return jsonb_build_object('ok', false, 'error', 'no_valid_line');
  end if;

  perform app.recalc_restaurant_order(_order_id);

  select * into _order
  from public.restaurant_orders ro
  where ro.id = _order_id
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', _order.id,
      'reference', _order.reference,
      'status', _order.status,
      'payment_status', _order.payment_status,
      'subtotal_cents', _order.subtotal_cents,
      'vat_cents', _order.vat_cents,
      'total_cents', _order.total_cents,
      'currency', _order.currency,
      'created_at', _order.created_at
    )
  );
end;
$$;

grant execute on function app.create_public_restaurant_order(text, jsonb, text, text, text, text) to anon, authenticated;

-- Public wrappers (PostgREST rpc() targets public schema by default)
create or replace function public.get_public_restaurant_catalog(p_location_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select app.get_public_restaurant_catalog(p_location_slug);
$$;

grant execute on function public.get_public_restaurant_catalog(text) to anon, authenticated;

create or replace function public.create_public_restaurant_order(
  p_location_slug text,
  p_lines jsonb,
  p_table_label text default null,
  p_customer_name text default null,
  p_note text default null,
  p_source text default 'qr'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select app.create_public_restaurant_order(
    p_location_slug,
    p_lines,
    p_table_label,
    p_customer_name,
    p_note,
    p_source
  );
$$;

grant execute on function public.create_public_restaurant_order(text, jsonb, text, text, text, text) to anon, authenticated;

-- =============================================
-- 4) RLS policies
-- =============================================

alter table public.restaurant_locations enable row level security;
alter table public.restaurant_locations force row level security;
alter table public.restaurant_menu_categories enable row level security;
alter table public.restaurant_menu_categories force row level security;
alter table public.restaurant_menu_items enable row level security;
alter table public.restaurant_menu_items force row level security;
alter table public.restaurant_item_recipes enable row level security;
alter table public.restaurant_item_recipes force row level security;
alter table public.restaurant_orders enable row level security;
alter table public.restaurant_orders force row level security;
alter table public.restaurant_order_lines enable row level security;
alter table public.restaurant_order_lines force row level security;

do $$
begin
  -- locations
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_locations' and policyname='restaurant_locations_select_member'
  ) then
    create policy restaurant_locations_select_member
      on public.restaurant_locations
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_locations' and policyname='restaurant_locations_write_admin'
  ) then
    create policy restaurant_locations_write_admin
      on public.restaurant_locations
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  -- categories
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_menu_categories' and policyname='restaurant_menu_categories_select_member'
  ) then
    create policy restaurant_menu_categories_select_member
      on public.restaurant_menu_categories
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_menu_categories' and policyname='restaurant_menu_categories_write_admin'
  ) then
    create policy restaurant_menu_categories_write_admin
      on public.restaurant_menu_categories
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  -- menu items
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_menu_items' and policyname='restaurant_menu_items_select_member'
  ) then
    create policy restaurant_menu_items_select_member
      on public.restaurant_menu_items
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_menu_items' and policyname='restaurant_menu_items_write_admin'
  ) then
    create policy restaurant_menu_items_write_admin
      on public.restaurant_menu_items
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  -- recipes
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_item_recipes' and policyname='restaurant_item_recipes_select_member'
  ) then
    create policy restaurant_item_recipes_select_member
      on public.restaurant_item_recipes
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_item_recipes' and policyname='restaurant_item_recipes_write_admin'
  ) then
    create policy restaurant_item_recipes_write_admin
      on public.restaurant_item_recipes
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  -- orders
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_orders' and policyname='restaurant_orders_select_member'
  ) then
    create policy restaurant_orders_select_member
      on public.restaurant_orders
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_orders' and policyname='restaurant_orders_write_member'
  ) then
    create policy restaurant_orders_write_member
      on public.restaurant_orders
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  end if;

  -- order lines
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_order_lines' and policyname='restaurant_order_lines_select_member'
  ) then
    create policy restaurant_order_lines_select_member
      on public.restaurant_order_lines
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='restaurant_order_lines' and policyname='restaurant_order_lines_write_member'
  ) then
    create policy restaurant_order_lines_write_member
      on public.restaurant_order_lines
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  end if;
end
$$;

-- Refresh entitlements for existing subs if needed.
update public.organization_subscriptions
set status = status
where id is not null;
