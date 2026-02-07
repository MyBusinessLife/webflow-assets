-- 012_factures_tables_and_rls.sql
-- Invoices (FR) with safe numbering (per org/per year) + tenant RLS.

create extension if not exists pgcrypto;
create schema if not exists app;

-- Numbering sequence per org/year (invoice numbering must be unique & sequential).
create table if not exists public.facture_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series text not null default 'FA',
  year int4 not null,
  next_number int4 not null default 1,
  padding int4 not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, series, year)
);

create index if not exists facture_sequences_org_idx
  on public.facture_sequences (organization_id, year desc);

drop trigger if exists trg_touch_facture_sequences on public.facture_sequences;
create trigger trg_touch_facture_sequences
before update on public.facture_sequences
for each row execute function app.touch_updated_at();

create or replace function app.next_facture_reference(p_org uuid, p_date date default current_date)
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
  _seq public.facture_sequences;
  _num int;
begin
  _org := coalesce(p_org, app.current_organization_id());
  if _org is null then
    raise exception 'organization_id_required';
  end if;

  _d := coalesce(p_date, current_date);
  _year := extract(year from _d)::int;

  select
    coalesce(nullif(trim(op.invoice_prefix), ''), 'FA'),
    greatest(1, coalesce(op.invoice_padding, 4))
  into _series, _pad
  from public.organization_profiles op
  where op.organization_id = _org;

  if _series is null then _series := 'FA'; end if;
  if _pad is null then _pad := 4; end if;

  insert into public.facture_sequences (organization_id, series, year, next_number, padding)
  values (_org, _series, _year, 1, _pad)
  on conflict (organization_id, series, year) do nothing;

  select *
  into _seq
  from public.facture_sequences
  where organization_id = _org and series = _series and year = _year
  for update;

  _num := _seq.next_number;

  update public.facture_sequences
  set next_number = _seq.next_number + 1,
      padding = greatest(1, coalesce(_seq.padding, _pad)),
      updated_at = now()
  where id = _seq.id;

  return _series || '-' || _year::text || '-' || lpad(_num::text, greatest(1, coalesce(_seq.padding, _pad)), '0');
end;
$$;

grant execute on function app.next_facture_reference(uuid, date) to authenticated, anon;

create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  reference text, -- assigned when issued (sequential)
  status text not null default 'draft',
  issue_date date,
  service_date date, -- date de prestation
  due_date date,

  client_id uuid references public.clients(id) on delete set null,
  site_id uuid references public.client_sites(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  devis_id uuid references public.devis(id) on delete set null,

  -- Snapshot fields (buyer)
  client_name text,
  client_email text,
  client_phone text,
  client_address text,
  buyer jsonb not null default '{}'::jsonb,

  -- Snapshot fields (seller)
  seller jsonb not null default '{}'::jsonb,

  notes text,
  terms text,

  items jsonb not null default '[]'::jsonb,
  subtotal_cents int8 not null default 0,
  discount_cents int8 not null default 0,
  vat_cents int8 not null default 0,
  total_cents int8 not null default 0,
  currency text not null default 'EUR',

  -- Payment / legal defaults (snapshot)
  payment_terms_days int4,
  late_fee_rate numeric,
  recovery_fee_cents int8,
  vat_exemption_text text,

  pdf_path text,
  pdf_url text,

  created_by uuid,
  issued_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure money columns are big-int (future safe).
alter table if exists public.factures alter column subtotal_cents type int8 using subtotal_cents::int8;
alter table if exists public.factures alter column discount_cents type int8 using discount_cents::int8;
alter table if exists public.factures alter column vat_cents type int8 using vat_cents::int8;
alter table if exists public.factures alter column total_cents type int8 using total_cents::int8;
alter table if exists public.factures alter column recovery_fee_cents type int8 using recovery_fee_cents::int8;

create index if not exists factures_org_created_idx on public.factures (organization_id, created_at desc);
create index if not exists factures_org_status_idx on public.factures (organization_id, status, created_at desc);
create index if not exists factures_org_client_idx on public.factures (organization_id, client_id, created_at desc);

create unique index if not exists factures_org_reference_uidx
  on public.factures (organization_id, reference)
  where reference is not null and reference <> '';

do $$
begin
  if to_regclass('public.factures') is not null and not exists (
    select 1 from pg_constraint where conname = 'factures_status_check'
  ) then
    alter table public.factures
      add constraint factures_status_check
      check (status in ('draft','issued','sent','partially_paid','paid','void','canceled')) not valid;
  end if;
end
$$;

create or replace function app.factures_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _op public.organization_profiles;
  _client public.clients;
  _site public.client_sites;
begin
  _org := coalesce(new.organization_id, app.current_organization_id());
  if _org is not null then
    new.organization_id := _org;
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  new.updated_at := now();

  select * into _op from public.organization_profiles where organization_id = new.organization_id;

  -- Defaults
  if new.payment_terms_days is null then
    new.payment_terms_days := coalesce(_op.payment_terms_days, 30);
  end if;
  if new.late_fee_rate is null then
    new.late_fee_rate := coalesce(_op.late_fee_rate, 10.0);
  end if;
  if new.recovery_fee_cents is null then
    new.recovery_fee_cents := coalesce(_op.recovery_fee_cents, 4000);
  end if;
  if new.vat_exemption_text is null then
    new.vat_exemption_text := _op.vat_exemption_text;
  end if;

  -- Link snapshots from client/site if ids are present.
  if new.client_id is not null then
    select * into _client from public.clients where id = new.client_id;
    if found then
      if new.organization_id is null then
        new.organization_id := _client.organization_id;
      end if;
      new.client_name := coalesce(new.client_name, _client.legal_name, _client.name);
      new.client_email := coalesce(new.client_email, _client.email);
      new.client_phone := coalesce(new.client_phone, _client.phone);
      new.client_address := coalesce(
        new.client_address,
        nullif(trim(_client.billing_address), ''),
        nullif(trim(_client.metadata->>'billing_address'), '')
      );

      new.payment_terms_days := coalesce(new.payment_terms_days, _client.payment_terms_days);
      new.late_fee_rate := coalesce(new.late_fee_rate, _client.late_fee_rate);
      new.recovery_fee_cents := coalesce(new.recovery_fee_cents, _client.recovery_fee_cents);
      if coalesce(_client.is_vat_exempt, false) then
        new.vat_exemption_text := coalesce(new.vat_exemption_text, _client.vat_exemption_text, _op.vat_exemption_text);
      end if;
    end if;
  end if;

  if new.site_id is not null then
    select * into _site from public.client_sites where id = new.site_id;
    if found then
      if new.organization_id is null then
        new.organization_id := _site.organization_id;
      end if;
      new.client_address := coalesce(new.client_address, _site.address);
      new.client_phone := coalesce(new.client_phone, _site.support_phone);
    end if;
  end if;

  -- Buyer snapshot fallback (if empty).
  if new.buyer is null or new.buyer = '{}'::jsonb then
    new.buyer := jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(trim(coalesce(new.client_name, '')), ''),
      'email', nullif(trim(coalesce(new.client_email, '')), ''),
      'phone', nullif(trim(coalesce(new.client_phone, '')), ''),
      'address', nullif(trim(coalesce(new.client_address, '')), '')
    ));
  end if;

  -- Seller snapshot fallback (if empty).
  if new.seller is null or new.seller = '{}'::jsonb then
    new.seller := jsonb_strip_nulls(jsonb_build_object(
      'legal_name', nullif(trim(coalesce(_op.legal_name, '')), ''),
      'trade_name', nullif(trim(coalesce(_op.trade_name, '')), ''),
      'legal_form', nullif(trim(coalesce(_op.legal_form, '')), ''),
      'share_capital_cents', _op.share_capital_cents,
      'siret', nullif(trim(coalesce(_op.siret, '')), ''),
      'vat_number', nullif(trim(coalesce(_op.vat_number, '')), ''),
      'rcs_city', nullif(trim(coalesce(_op.rcs_city, '')), ''),
      'rcs_number', nullif(trim(coalesce(_op.rcs_number, '')), ''),
      'naf_code', nullif(trim(coalesce(_op.naf_code, '')), ''),
      'address', nullif(trim(coalesce(_op.address, '')), ''),
      'postal_code', nullif(trim(coalesce(_op.postal_code, '')), ''),
      'city', nullif(trim(coalesce(_op.city, '')), ''),
      'country', nullif(trim(coalesce(_op.country, '')), ''),
      'email', nullif(trim(coalesce(_op.email, '')), ''),
      'phone', nullif(trim(coalesce(_op.phone, '')), '')
    ));
  end if;

  -- Status-based timestamps + numbering.
  if new.status is null then
    new.status := 'draft';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      if new.issue_date is null then new.issue_date := current_date; end if;
      if new.reference is null or nullif(trim(new.reference), '') is null then
        new.reference := app.next_facture_reference(new.organization_id, new.issue_date);
      end if;
      new.issued_at := coalesce(new.issued_at, now());
      if new.due_date is null and new.issue_date is not null then
        new.due_date := new.issue_date + coalesce(new.payment_terms_days, 30);
      end if;
    end if;
    return new;
  end if;

  if coalesce(old.status, 'draft') = 'draft' and new.status <> 'draft' then
    if new.issue_date is null then new.issue_date := current_date; end if;
    if new.reference is null or nullif(trim(new.reference), '') is null then
      new.reference := app.next_facture_reference(new.organization_id, new.issue_date);
    end if;
    new.issued_at := coalesce(new.issued_at, now());
    if new.due_date is null and new.issue_date is not null then
      new.due_date := new.issue_date + coalesce(new.payment_terms_days, 30);
    end if;
  end if;

  if coalesce(old.status, '') <> 'sent' and new.status = 'sent' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  if coalesce(old.status, '') <> 'paid' and new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  if coalesce(old.status, '') <> 'canceled' and new.status = 'canceled' then
    new.canceled_at := coalesce(new.canceled_at, now());
  end if;

  return new;
end;
$$;

grant execute on function app.factures_before_write() to authenticated, anon;

drop trigger if exists trg_factures_before_write on public.factures;
create trigger trg_factures_before_write
before insert or update on public.factures
for each row execute function app.factures_before_write();

-- Link devis.converted_facture_id -> factures (optional FK once factures exists).
do $$
begin
  if to_regclass('public.devis') is null or to_regclass('public.factures') is null then
    return;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devis_converted_facture_id_fkey') then
    alter table public.devis
      add constraint devis_converted_facture_id_fkey
      foreign key (converted_facture_id) references public.factures(id) on delete set null;
  end if;
end
$$;

-- RLS
alter table public.factures enable row level security;
alter table public.factures force row level security;
alter table public.facture_sequences enable row level security;
alter table public.facture_sequences force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='factures' and policyname='factures_select_member'
  ) then
    create policy factures_select_member
      on public.factures
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='factures' and policyname='factures_write_admin'
  ) then
    create policy factures_write_admin
      on public.factures
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='facture_sequences' and policyname='facture_sequences_select_admin'
  ) then
    create policy facture_sequences_select_admin
      on public.facture_sequences
      for select
      using (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='facture_sequences' and policyname='facture_sequences_write_admin'
  ) then
    create policy facture_sequences_write_admin
      on public.facture_sequences
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

