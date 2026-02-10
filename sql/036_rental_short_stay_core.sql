-- 036_rental_short_stay_core.sql
-- Short-stay rental foundations:
-- - rental listings (annonces)
-- - night reservations (public + internal blocks)
-- - non-overlap protection (calendar)
-- - public RPCs for guest bookings (no login)
--
-- Safe to re-run (idempotent).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists app;

-- =============================================
-- Listings
-- =============================================

create table if not exists public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  summary text,
  description text,
  address text,
  city text,
  postal_code text,
  country text,
  lat numeric,
  lng numeric,
  currency text not null default 'EUR',
  nightly_price_cents int8 not null default 0,
  cleaning_fee_cents int8 not null default 0,
  security_deposit_cents int8 not null default 0,
  vat_rate numeric not null default 0,
  min_nights int4 not null default 1,
  max_nights int4,
  checkin_time text default '16:00',
  checkout_time text default '11:00',
  max_guests int4 not null default 2,
  bedrooms int4,
  beds int4,
  bathrooms numeric,
  cover_image_url text,
  gallery_urls jsonb not null default '[]'::jsonb,
  amenities jsonb not null default '{}'::jsonb,
  house_rules text,
  cancellation_policy text,
  is_published boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_id)
);

create index if not exists rental_listings_org_idx
  on public.rental_listings (organization_id, created_at desc);
create index if not exists rental_listings_org_published_idx
  on public.rental_listings (organization_id, is_published, updated_at desc);

drop trigger if exists trg_touch_rental_listings on public.rental_listings;
create trigger trg_touch_rental_listings
before update on public.rental_listings
for each row execute function app.touch_updated_at();

create or replace function app.rental_listings_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rental_listings_set_defaults on public.rental_listings;
create trigger trg_rental_listings_set_defaults
before insert or update on public.rental_listings
for each row execute function app.rental_listings_set_defaults();

-- =============================================
-- Reservations (bookings + blocks)
-- =============================================

create table if not exists public.rental_reservations (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid(), -- shareable id for guests
  organization_id uuid not null references public.organizations(id) on delete cascade,
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  kind text not null default 'booking' check (kind in ('booking','block')),
  source text not null default 'manual' check (source in ('public','manual','import')),
  status text not null default 'pending' check (status in ('pending','confirmed','declined','canceled','blocked')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  check_in date not null,
  check_out date not null,
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  nights int4 not null default 1,
  guests_count int4 not null default 1,
  guest_name text,
  guest_email text,
  guest_phone text,
  note text,
  currency text not null default 'EUR',
  subtotal_cents int8 not null default 0,
  cleaning_fee_cents int8 not null default 0,
  taxes_cents int8 not null default 0,
  total_cents int8 not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_id),
  constraint rental_reservations_dates_chk check (check_out > check_in)
);

create index if not exists rental_reservations_org_idx
  on public.rental_reservations (organization_id, created_at desc);
create index if not exists rental_reservations_listing_idx
  on public.rental_reservations (listing_id, check_in, check_out);
create index if not exists rental_reservations_status_idx
  on public.rental_reservations (organization_id, status, check_in);

-- Prevent overlapping stays for active reservations.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rental_reservations_no_overlap'
  ) then
    alter table public.rental_reservations
      add constraint rental_reservations_no_overlap
      exclude using gist (
        listing_id with =,
        stay with &&
      )
      where (status in ('pending','confirmed','blocked'));
  end if;
end
$$;

drop trigger if exists trg_touch_rental_reservations on public.rental_reservations;
create trigger trg_touch_rental_reservations
before update on public.rental_reservations
for each row execute function app.touch_updated_at();

create or replace function app.rental_reservations_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.currency is null or btrim(new.currency) = '' then
    new.currency := 'EUR';
  end if;
  if new.nights is null or new.nights <= 0 then
    new.nights := greatest(1, (new.check_out - new.check_in));
  end if;
  if new.guests_count is null or new.guests_count <= 0 then
    new.guests_count := 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rental_reservations_set_defaults on public.rental_reservations;
create trigger trg_rental_reservations_set_defaults
before insert or update on public.rental_reservations
for each row execute function app.rental_reservations_set_defaults();

-- =============================================
-- RLS
-- =============================================

alter table public.rental_listings enable row level security;
alter table public.rental_listings force row level security;
alter table public.rental_reservations enable row level security;
alter table public.rental_reservations force row level security;

do $$
begin
  -- Listings
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rental_listings' and policyname='rental_listings_select_member'
  ) then
    create policy rental_listings_select_member
      on public.rental_listings
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rental_listings' and policyname='rental_listings_write_admin'
  ) then
    create policy rental_listings_write_admin
      on public.rental_listings
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  -- Reservations
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rental_reservations' and policyname='rental_reservations_select_member'
  ) then
    create policy rental_reservations_select_member
      on public.rental_reservations
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rental_reservations' and policyname='rental_reservations_write_admin'
  ) then
    create policy rental_reservations_write_admin
      on public.rental_reservations
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

-- =============================================
-- Public RPCs (guest booking without login)
-- =============================================

create or replace function public.get_public_rental_listing(
  p_public_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _l public.rental_listings;
  _from date;
  _to date;
  _booked jsonb;
begin
  select * into _l
  from public.rental_listings
  where public_id = p_public_id
    and is_active = true
    and is_published = true
  limit 1;

  if not found then
    return null;
  end if;

  _from := coalesce(p_from, current_date);
  _to := coalesce(p_to, (_from + 90));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'check_in', r.check_in,
        'check_out', r.check_out,
        'status', r.status
      )
      order by r.check_in asc
    ),
    '[]'::jsonb
  )
  into _booked
  from public.rental_reservations r
  where r.listing_id = _l.id
    and r.status in ('pending','confirmed','blocked')
    and r.check_out > _from
    and r.check_in < _to;

  return jsonb_build_object(
    'public_id', _l.public_id,
    'title', _l.title,
    'summary', _l.summary,
    'description', _l.description,
    'city', _l.city,
    'country', _l.country,
    'currency', _l.currency,
    'nightly_price_cents', _l.nightly_price_cents,
    'cleaning_fee_cents', _l.cleaning_fee_cents,
    'security_deposit_cents', _l.security_deposit_cents,
    'vat_rate', _l.vat_rate,
    'min_nights', _l.min_nights,
    'max_nights', _l.max_nights,
    'checkin_time', _l.checkin_time,
    'checkout_time', _l.checkout_time,
    'max_guests', _l.max_guests,
    'bedrooms', _l.bedrooms,
    'beds', _l.beds,
    'bathrooms', _l.bathrooms,
    'cover_image_url', _l.cover_image_url,
    'gallery_urls', _l.gallery_urls,
    'amenities', _l.amenities,
    'house_rules', _l.house_rules,
    'cancellation_policy', _l.cancellation_policy,
    'booked', _booked
  );
end;
$$;

revoke all on function public.get_public_rental_listing(uuid, date, date) from public;
grant execute on function public.get_public_rental_listing(uuid, date, date) to anon, authenticated;

create or replace function public.create_public_rental_booking(
  p_listing_public_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guests int default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _l public.rental_listings;
  _nights int4;
  _subtotal int8;
  _total int8;
  _id uuid;
  _pub uuid;
begin
  if p_listing_public_id is null then
    raise exception 'missing_listing';
  end if;

  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_dates';
  end if;

  select * into _l
  from public.rental_listings
  where public_id = p_listing_public_id
    and is_active = true
    and is_published = true
  limit 1;

  if not found then
    raise exception 'listing_not_found';
  end if;

  _nights := greatest(1, (p_check_out - p_check_in));
  if _nights < coalesce(_l.min_nights, 1) then
    raise exception 'min_nights';
  end if;
  if _l.max_nights is not null and _nights > _l.max_nights then
    raise exception 'max_nights';
  end if;

  if coalesce(p_guests, 1) > coalesce(_l.max_guests, 99) then
    raise exception 'max_guests';
  end if;

  if nullif(btrim(p_guest_name), '') is null then
    raise exception 'guest_name_required';
  end if;
  if nullif(btrim(p_guest_email), '') is null then
    raise exception 'guest_email_required';
  end if;

  _subtotal := _nights * coalesce(_l.nightly_price_cents, 0);
  _total := _subtotal + coalesce(_l.cleaning_fee_cents, 0);

  insert into public.rental_reservations (
    organization_id,
    listing_id,
    kind,
    source,
    status,
    payment_status,
    check_in,
    check_out,
    nights,
    guests_count,
    guest_name,
    guest_email,
    guest_phone,
    note,
    currency,
    subtotal_cents,
    cleaning_fee_cents,
    taxes_cents,
    total_cents
  )
  values (
    _l.organization_id,
    _l.id,
    'booking',
    'public',
    'pending',
    'unpaid',
    p_check_in,
    p_check_out,
    _nights,
    greatest(1, coalesce(p_guests, 1)),
    nullif(btrim(p_guest_name), ''),
    nullif(btrim(p_guest_email), ''),
    nullif(btrim(p_guest_phone), ''),
    nullif(btrim(p_note), ''),
    _l.currency,
    _subtotal,
    coalesce(_l.cleaning_fee_cents, 0),
    0,
    _total
  )
  returning id, public_id into _id, _pub;

  return jsonb_build_object(
    'booking_public_id', _pub,
    'status', 'pending',
    'nights', _nights,
    'subtotal_cents', _subtotal,
    'cleaning_fee_cents', coalesce(_l.cleaning_fee_cents, 0),
    'total_cents', _total,
    'currency', _l.currency
  );
exception
  when exclusion_violation then
    raise exception 'dates_unavailable';
end;
$$;

revoke all on function public.create_public_rental_booking(uuid, date, date, text, text, text, int, text) from public;
grant execute on function public.create_public_rental_booking(uuid, date, date, text, text, text, int, text) to anon, authenticated;

create or replace function public.get_public_rental_booking(p_booking_public_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _r public.rental_reservations;
begin
  select * into _r
  from public.rental_reservations
  where public_id = p_booking_public_id
  limit 1;

  if not found then
    return null;
  end if;

  -- Do not leak org/listing ids publicly.
  return jsonb_build_object(
    'booking_public_id', _r.public_id,
    'status', _r.status,
    'payment_status', _r.payment_status,
    'check_in', _r.check_in,
    'check_out', _r.check_out,
    'nights', _r.nights,
    'guests_count', _r.guests_count,
    'currency', _r.currency,
    'total_cents', _r.total_cents,
    'created_at', _r.created_at
  );
end;
$$;

revoke all on function public.get_public_rental_booking(uuid) from public;
grant execute on function public.get_public_rental_booking(uuid) to anon, authenticated;

