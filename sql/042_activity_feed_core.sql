-- 042_activity_feed_core.sql
-- Unified activity feed (timeline) for the whole SaaS (cross-module).
-- Design goals:
-- - Multi-tenant (organization_id everywhere)
-- - Append-only (no updates/deletes from the app)
-- - Safe inserts via security definer function (membership-checked)
-- - Optional triggers for key business events (invoice payments, intervention completion, purchase receipts posting)

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Activity events (append-only)
-- =========================================================
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid, -- auth.users.id (nullable for system events)

  event_type text not null, -- ex: 'invoice.payment_succeeded'
  severity text not null default 'info' check (severity in ('info','success','warning','error')),

  entity_type text, -- ex: 'factures', 'interventions', 'purchase_orders'
  entity_id uuid,

  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists activity_events_org_created_idx
  on public.activity_events (organization_id, created_at desc);

create index if not exists activity_events_org_type_idx
  on public.activity_events (organization_id, event_type, created_at desc);

-- =========================================================
-- Safe insert helper (used by triggers + app RPC).
-- - Bypasses RLS internally, but enforces org membership.
-- =========================================================
create or replace function app.log_activity_event(
  p_org uuid,
  p_event_type text,
  p_severity text default 'info',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _org uuid;
  _etype text;
  _sev text;
  _id uuid;
  _jwt_role text;
begin
  _org := coalesce(p_org, app.current_organization_id());
  if _org is null then
    raise exception 'organization_id_required';
  end if;

  _etype := nullif(trim(coalesce(p_event_type, '')), '');
  if _etype is null then
    raise exception 'event_type_required';
  end if;

  _sev := lower(nullif(trim(coalesce(p_severity, '')), ''));
  if _sev is null then _sev := 'info'; end if;
  if _sev not in ('info','success','warning','error') then
    _sev := 'info';
  end if;

  _jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');

  -- If there's no user (auth.uid() is null), allow inserts only for service roles.
  -- This is required for Stripe/webhooks (service key) and other server-side jobs.
  if auth.uid() is null then
    if coalesce(_jwt_role, '') not in ('service_role', 'supabase_admin') then
      raise exception 'forbidden';
    end if;
  else
    if not app.is_org_member(_org) then
      raise exception 'forbidden';
    end if;
  end if;

  insert into public.activity_events (
    organization_id,
    actor_user_id,
    event_type,
    severity,
    entity_type,
    entity_id,
    title,
    body,
    metadata
  ) values (
    _org,
    auth.uid(),
    _etype,
    _sev,
    nullif(trim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into _id;

  return _id;
end;
$$;

grant execute on function app.log_activity_event(uuid, text, text, text, uuid, text, text, jsonb) to authenticated, anon;

-- =========================================================
-- Triggers for key events
-- =========================================================

-- 1) Invoice payment succeeded (manual + Stripe).
create or replace function app.activity_on_invoice_payments_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _title text;
begin
  -- only log successful inbound payments
  if coalesce(new.status, '') <> 'succeeded' then
    return new;
  end if;
  if coalesce(new.direction, 'in') <> 'in' then
    return new;
  end if;

  _title := 'Paiement reçu';

  perform app.log_activity_event(
    new.organization_id,
    'invoice.payment_succeeded',
    'success',
    'factures',
    new.invoice_id,
    _title,
    null,
    jsonb_build_object(
      'amount_cents', new.amount_cents,
      'currency', new.currency,
      'provider', new.provider,
      'provider_ref', new.provider_ref,
      'paid_at', new.paid_at
    )
  );

  return new;
end;
$$;

grant execute on function app.activity_on_invoice_payments_insert() to authenticated, anon;

do $$
begin
  if to_regclass('public.invoice_payments') is null then
    return;
  end if;

  execute 'drop trigger if exists trg_activity_invoice_payments on public.invoice_payments';
  execute 'create trigger trg_activity_invoice_payments after insert on public.invoice_payments for each row execute function app.activity_on_invoice_payments_insert()';
end
$$;

-- 2) Intervention completed / canceled.
create or replace function app.activity_on_interventions_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _ns text;
  _title text;
  _etype text;
  _sev text;
begin
  _ns := lower(nullif(trim(coalesce(new.status, '')), ''));
  if _ns is null then
    return new;
  end if;

  if coalesce(old.status, '') = coalesce(new.status, '') then
    return new;
  end if;

  if _ns = 'done' then
    _etype := 'intervention.completed';
    _title := 'Intervention terminée';
    _sev := 'success';
  elsif _ns in ('canceled','cancelled') then
    _etype := 'intervention.canceled';
    _title := 'Intervention annulée';
    _sev := 'warning';
  else
    return new;
  end if;

  perform app.log_activity_event(
    new.organization_id,
    _etype,
    _sev,
    'interventions',
    new.id,
    _title,
    null,
    jsonb_build_object(
      'internal_ref', new.internal_ref,
      'title', new.title,
      'client_name', new.client_name,
      'start_at', new.start_at,
      'end_at', new.end_at,
      'status', new.status
    )
  );

  return new;
end;
$$;

grant execute on function app.activity_on_interventions_status_change() to authenticated, anon;

do $$
begin
  if to_regclass('public.interventions') is null then
    return;
  end if;

  execute 'drop trigger if exists trg_activity_interventions_status on public.interventions';
  execute 'create trigger trg_activity_interventions_status after update of status on public.interventions for each row execute function app.activity_on_interventions_status_change()';
end
$$;

-- 3) Purchase receipt posted.
create or replace function app.activity_on_purchase_receipts_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if coalesce(old.status, '') = coalesce(new.status, '') then
    return new;
  end if;

  if coalesce(new.status, '') <> 'posted' then
    return new;
  end if;

  perform app.log_activity_event(
    new.organization_id,
    'purchase.receipt_posted',
    'success',
    'purchase_receipts',
    new.id,
    'Réception validée',
    null,
    jsonb_build_object(
      'purchase_order_id', new.purchase_order_id,
      'received_at', new.received_at,
      'posted_at', new.posted_at
    )
  );

  return new;
end;
$$;

grant execute on function app.activity_on_purchase_receipts_status_change() to authenticated, anon;

do $$
begin
  if to_regclass('public.purchase_receipts') is null then
    return;
  end if;

  execute 'drop trigger if exists trg_activity_purchase_receipts_status on public.purchase_receipts';
  execute 'create trigger trg_activity_purchase_receipts_status after update of status on public.purchase_receipts for each row execute function app.activity_on_purchase_receipts_status_change()';
end
$$;

-- =========================================================
-- RLS (read for org members, append-only)
-- =========================================================
alter table public.activity_events enable row level security;
alter table public.activity_events force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='activity_events' and policyname='activity_events_select_member'
  ) then
    create policy activity_events_select_member
      on public.activity_events
      for select
      using (app.is_org_member(organization_id));
  end if;
end
$$;
