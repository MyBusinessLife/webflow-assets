-- 029_restaurant_public_links_and_pos_scope.sql
-- Harden restaurant public links (global uniqueness) and keep POS reusable across modules.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- 1) Restaurant public link hardening
-- =========================================================

alter table if exists public.restaurant_locations
  add column if not exists public_access_key text;

-- Auto-fill + auto-unique for slug (per org), query key (global), access key (global).
create or replace function app.restaurant_locations_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _base text;
  _candidate text;
  _i int;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;
  _org := new.organization_id;

  -- Internal slug (human-readable), unique per organization.
  if coalesce(nullif(new.slug, ''), '') = '' then
    _base := coalesce(app.slug_base(new.name), 'restaurant');
  else
    _base := coalesce(app.slug_base(new.slug), app.slug_base(new.name), 'restaurant');
  end if;
  if _base is null or _base = '' then
    _base := 'restaurant';
  end if;

  if tg_op = 'INSERT' or new.slug is distinct from old.slug or coalesce(new.slug, '') = '' then
    _candidate := left(_base, 48);
    _i := 0;
    loop
      if _i = 0 then
        new.slug := _candidate;
      else
        new.slug := left(_candidate, 43) || '-' || lpad(_i::text, 2, '0');
      end if;

      exit when not exists (
        select 1
        from public.restaurant_locations l
        where l.organization_id = _org
          and lower(l.slug) = lower(new.slug)
          and l.id <> new.id
      );

      _i := _i + 1;
      if _i > 99 then
        new.slug := left(_candidate, 40) || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6);
        exit;
      end if;
    end loop;
  end if;

  -- Public query key (parameter name), globally unique.
  if coalesce(nullif(new.public_query_key, ''), '') = '' then
    new.public_query_key := 'rk_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  new.public_query_key := regexp_replace(lower(new.public_query_key), '[^a-z0-9_]+', '', 'g');
  if new.public_query_key = '' then
    new.public_query_key := 'rk_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  if tg_op = 'INSERT' or new.public_query_key is distinct from old.public_query_key then
    _candidate := left(new.public_query_key, 32);
    loop
      exit when not exists (
        select 1
        from public.restaurant_locations l
        where lower(l.public_query_key) = lower(new.public_query_key)
          and l.id <> new.id
      );
      new.public_query_key := left(_candidate, 23) || '_' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
    end loop;
  end if;

  -- Public access key (parameter value), globally unique.
  if coalesce(nullif(new.public_access_key, ''), '') = '' then
    new.public_access_key := 'rl_' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24);
  end if;
  new.public_access_key := regexp_replace(lower(new.public_access_key), '[^a-z0-9_]+', '', 'g');
  if new.public_access_key = '' then
    new.public_access_key := 'rl_' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24);
  end if;

  if tg_op = 'INSERT' or new.public_access_key is distinct from old.public_access_key then
    loop
      exit when not exists (
        select 1
        from public.restaurant_locations l
        where lower(l.public_access_key) = lower(new.public_access_key)
          and l.id <> new.id
      );
      new.public_access_key := 'rl_' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24);
    end loop;
  end if;

  return new;
end;
$$;

grant execute on function app.restaurant_locations_before_write() to authenticated, anon;

drop trigger if exists trg_restaurant_locations_before_write on public.restaurant_locations;
create trigger trg_restaurant_locations_before_write
before insert or update on public.restaurant_locations
for each row execute function app.restaurant_locations_before_write();

-- Regenerate query/access keys for existing rows so links are conflict-free across all tenants.
update public.restaurant_locations
set slug = coalesce(nullif(slug, ''), name),
    public_query_key = '',
    public_access_key = '',
    updated_at = now()
where id is not null;

alter table if exists public.restaurant_locations
  alter column public_access_key set not null;

create unique index if not exists restaurant_locations_public_query_key_uidx
  on public.restaurant_locations (public_query_key)
  where public_query_key is not null and public_query_key <> '';

create unique index if not exists restaurant_locations_public_access_key_uidx
  on public.restaurant_locations (public_access_key)
  where public_access_key is not null and public_access_key <> '';

-- =========================================================
-- 2) Public RPC: resolve location by access key first, then slug fallback (non-ambiguous)
-- =========================================================

create or replace function app.get_public_restaurant_catalog(p_location_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _identifier text := lower(trim(coalesce(p_location_slug, '')));
  _loc record;
  _slug_count int := 0;
  _categories jsonb := '[]'::jsonb;
  _items jsonb := '[]'::jsonb;
begin
  if _identifier = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_location_identifier');
  end if;

  -- Preferred path: globally unique access key.
  select l.* into _loc
  from public.restaurant_locations l
  where l.is_active = true
    and l.public_is_open = true
    and lower(coalesce(l.public_access_key, '')) = _identifier
  order by l.created_at asc
  limit 1;

  -- Legacy fallback: slug only if globally unambiguous.
  if _loc.id is null then
    select count(*)::int into _slug_count
    from public.restaurant_locations l
    where l.is_active = true
      and l.public_is_open = true
      and lower(l.slug) = _identifier;

    if _slug_count > 1 then
      return jsonb_build_object('ok', false, 'error', 'location_slug_ambiguous');
    end if;

    if _slug_count = 1 then
      select l.* into _loc
      from public.restaurant_locations l
      where l.is_active = true
        and l.public_is_open = true
        and lower(l.slug) = _identifier
      order by l.created_at asc
      limit 1;
    end if;
  end if;

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
      'public_query_key', _loc.public_query_key,
      'public_access_key', _loc.public_access_key,
      'currency', _loc.currency,
      'service_mode', _loc.service_mode,
      'public_page_path', _loc.public_page_path,
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
  _identifier text := lower(trim(coalesce(p_location_slug, '')));
  _loc record;
  _slug_count int := 0;
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
  if _identifier = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_location_identifier');
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_lines');
  end if;

  -- Preferred path: globally unique access key.
  select l.* into _loc
  from public.restaurant_locations l
  where l.is_active = true
    and l.public_is_open = true
    and lower(coalesce(l.public_access_key, '')) = _identifier
  order by l.created_at asc
  limit 1;

  -- Legacy fallback: slug only if globally unambiguous.
  if _loc.id is null then
    select count(*)::int into _slug_count
    from public.restaurant_locations l
    where l.is_active = true
      and l.public_is_open = true
      and lower(l.slug) = _identifier;

    if _slug_count > 1 then
      return jsonb_build_object('ok', false, 'error', 'location_slug_ambiguous');
    end if;

    if _slug_count = 1 then
      select l.* into _loc
      from public.restaurant_locations l
      where l.is_active = true
        and l.public_is_open = true
        and lower(l.slug) = _identifier
      order by l.created_at asc
      limit 1;
    end if;
  end if;

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

-- Keep public wrappers in sync with app.* signatures.
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
