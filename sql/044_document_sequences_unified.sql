-- 044_document_sequences_unified.sql
-- Document engine foundation (references/numbering):
-- - Unified sequences table for all document types (invoice, quote, purchase order, etc.).
-- - Generic function app.next_document_reference(...)
-- - Keep backward compatibility by re-implementing:
--   - app.next_facture_reference(...) -> uses unified sequences
--   - app.next_purchase_order_reference(...) -> uses unified sequences
-- - Add quote numbering function app.next_devis_reference(...) + auto-assign on status change.
--
-- Goal:
-- - One numbering engine, scalable to new doc types (credit notes, proforma...).
-- - Concurrency safe (FOR UPDATE) and per org/per year/per series.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Unified sequences
-- =========================================================
create table if not exists public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null, -- 'invoice' | 'quote' | 'purchase_order' | ...
  series text not null,
  year int4 not null,
  next_number int4 not null default 1,
  padding int4 not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, doc_type, series, year)
);

create index if not exists document_sequences_org_idx
  on public.document_sequences (organization_id, doc_type, year desc);

drop trigger if exists trg_touch_document_sequences on public.document_sequences;
create trigger trg_touch_document_sequences
before update on public.document_sequences
for each row execute function app.touch_updated_at();

-- Backfill from existing sequences (invoice, purchases) so numbering continuity is preserved.
do $$
begin
  if to_regclass('public.facture_sequences') is not null then
    insert into public.document_sequences (organization_id, doc_type, series, year, next_number, padding)
    select organization_id, 'invoice', series, year, next_number, padding
    from public.facture_sequences
    on conflict (organization_id, doc_type, series, year) do update
    set next_number = greatest(public.document_sequences.next_number, excluded.next_number),
        padding = greatest(1, excluded.padding),
        updated_at = now();
  end if;

  if to_regclass('public.purchase_order_sequences') is not null then
    insert into public.document_sequences (organization_id, doc_type, series, year, next_number, padding)
    select organization_id, 'purchase_order', series, year, next_number, padding
    from public.purchase_order_sequences
    on conflict (organization_id, doc_type, series, year) do update
    set next_number = greatest(public.document_sequences.next_number, excluded.next_number),
        padding = greatest(1, excluded.padding),
        updated_at = now();
  end if;
end
$$;

-- =========================================================
-- Generic reference generator
-- =========================================================
create or replace function app.next_document_reference(
  p_org uuid,
  p_doc_type text,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _doc text;
  _d date;
  _year int;
  _series text;
  _pad int;
  _seq public.document_sequences;
  _num int;
  _op public.organization_profiles;
begin
  _org := coalesce(p_org, app.current_organization_id());
  if _org is null then
    raise exception 'organization_id_required';
  end if;

  _doc := lower(nullif(trim(coalesce(p_doc_type, '')), ''));
  if _doc is null then
    raise exception 'doc_type_required';
  end if;

  _d := coalesce(p_date, current_date);
  _year := extract(year from _d)::int;

  select * into _op from public.organization_profiles where organization_id = _org;

  -- Resolve prefix + padding from org settings (fallbacks).
  if _doc = 'invoice' then
    _series := coalesce(nullif(trim(_op.invoice_prefix), ''), 'FA');
    _pad := greatest(1, coalesce(_op.invoice_padding, 4));
  elsif _doc = 'quote' then
    _series := coalesce(nullif(trim(_op.quote_prefix), ''), 'DV');
    _pad := greatest(1, coalesce(_op.quote_padding, 4));
  elsif _doc = 'purchase_order' then
    _series := coalesce(nullif(trim(_op.purchase_prefix), ''), 'BC');
    _pad := greatest(1, coalesce(_op.purchase_padding, 4));
  elsif _doc = 'credit_note' then
    _series := 'AV';
    _pad := 4;
  elsif _doc = 'proforma' then
    _series := 'PF';
    _pad := 4;
  else
    _series := upper(left(_doc, 2));
    if _series is null or length(_series) < 2 then _series := 'DOC'; end if;
    _pad := 4;
  end if;

  insert into public.document_sequences (organization_id, doc_type, series, year, next_number, padding)
  values (_org, _doc, _series, _year, 1, _pad)
  on conflict (organization_id, doc_type, series, year) do nothing;

  select *
  into _seq
  from public.document_sequences
  where organization_id = _org and doc_type = _doc and series = _series and year = _year
  for update;

  _num := _seq.next_number;

  update public.document_sequences
  set next_number = _seq.next_number + 1,
      padding = greatest(1, coalesce(_seq.padding, _pad)),
      updated_at = now()
  where id = _seq.id;

  return _series || '-' || _year::text || '-' || lpad(_num::text, greatest(1, coalesce(_seq.padding, _pad)), '0');
end;
$$;

grant execute on function app.next_document_reference(uuid, text, date) to authenticated, anon;

-- =========================================================
-- Backward-compatible wrappers
-- =========================================================
create or replace function app.next_facture_reference(p_org uuid, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return app.next_document_reference(p_org, 'invoice', p_date);
end;
$$;

grant execute on function app.next_facture_reference(uuid, date) to authenticated, anon;

create or replace function app.next_purchase_order_reference(p_org uuid, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return app.next_document_reference(p_org, 'purchase_order', p_date);
end;
$$;

grant execute on function app.next_purchase_order_reference(uuid, date) to authenticated, anon;

create or replace function app.next_devis_reference(p_org uuid, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return app.next_document_reference(p_org, 'quote', p_date);
end;
$$;

grant execute on function app.next_devis_reference(uuid, date) to authenticated, anon;

-- =========================================================
-- Quotes: status-based numbering + timestamps (like invoices)
-- =========================================================
alter table if exists public.devis add column if not exists issue_date date;
alter table if exists public.devis add column if not exists sent_at timestamptz;
alter table if exists public.devis add column if not exists accepted_at timestamptz;
alter table if exists public.devis add column if not exists rejected_at timestamptz;
alter table if exists public.devis add column if not exists canceled_at timestamptz;
alter table if exists public.devis add column if not exists expired_at timestamptz;

-- Replace defaults trigger function to allocate reference when leaving draft.
create or replace function app.devis_set_defaults()
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

  if new.status is null then
    new.status := 'draft';
  end if;

  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      if new.issue_date is null then new.issue_date := current_date; end if;
      if new.reference is null or nullif(trim(new.reference), '') is null then
        new.reference := app.next_devis_reference(new.organization_id, new.issue_date);
      end if;
      if new.status = 'sent' then new.sent_at := coalesce(new.sent_at, now()); end if;
      if new.status = 'accepted' then new.accepted_at := coalesce(new.accepted_at, now()); end if;
      if new.status = 'rejected' then new.rejected_at := coalesce(new.rejected_at, now()); end if;
      if new.status = 'canceled' then new.canceled_at := coalesce(new.canceled_at, now()); end if;
      if new.status = 'expired' then new.expired_at := coalesce(new.expired_at, now()); end if;
    end if;
    return new;
  end if;

  if coalesce(old.status, 'draft') = 'draft' and new.status <> 'draft' then
    if new.issue_date is null then new.issue_date := current_date; end if;
    if new.reference is null or nullif(trim(new.reference), '') is null then
      new.reference := app.next_devis_reference(new.organization_id, new.issue_date);
    end if;
  end if;

  if coalesce(old.status, '') <> 'sent' and new.status = 'sent' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  if coalesce(old.status, '') <> 'accepted' and new.status = 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  if coalesce(old.status, '') <> 'rejected' and new.status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;
  if coalesce(old.status, '') <> 'canceled' and new.status = 'canceled' then
    new.canceled_at := coalesce(new.canceled_at, now());
  end if;
  if coalesce(old.status, '') <> 'expired' and new.status = 'expired' then
    new.expired_at := coalesce(new.expired_at, now());
  end if;

  return new;
end;
$$;

grant execute on function app.devis_set_defaults() to authenticated, anon;

