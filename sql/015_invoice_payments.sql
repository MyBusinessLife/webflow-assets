-- 015_invoice_payments.sql
-- Payments (manual + Stripe) for invoices (factures) with auto status rollup.

create extension if not exists pgcrypto;
create schema if not exists app;

-- Store payments/refunds against invoices. Stripe writes come from Edge Functions (service role).
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.factures(id) on delete cascade,

  provider text not null default 'manual' check (provider in ('manual','stripe')),
  provider_ref text, -- e.g., Stripe payment_intent id

  direction text not null default 'in' check (direction in ('in','out')), -- in = payment, out = refund
  status text not null default 'succeeded' check (status in ('pending','succeeded','failed','canceled','refunded')),

  amount_cents int8 not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  paid_at timestamptz,

  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_payments_org_invoice_idx
  on public.invoice_payments (organization_id, invoice_id, created_at desc);

create unique index if not exists invoice_payments_provider_ref_uidx
  on public.invoice_payments (provider, provider_ref)
  where provider_ref is not null and provider_ref <> '';

drop trigger if exists trg_fill_organization_id on public.invoice_payments;
create trigger trg_fill_organization_id
before insert on public.invoice_payments
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_invoice_payments on public.invoice_payments;
create trigger trg_touch_invoice_payments
before update on public.invoice_payments
for each row execute function app.touch_updated_at();

-- Denormalized rollups for fast list UX.
alter table if exists public.factures add column if not exists paid_cents int8 not null default 0;
alter table if exists public.factures add column if not exists last_payment_at timestamptz;

alter table if exists public.factures alter column paid_cents type int8 using paid_cents::int8;

create or replace function app.recalc_facture_payments(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _inv public.factures;
  _paid int8;
  _last timestamptz;
  _next_status text;
begin
  if p_invoice_id is null then
    return;
  end if;

  select * into _inv from public.factures where id = p_invoice_id;
  if not found then
    return;
  end if;

  select
    coalesce(sum(
      case
        when p.status = 'succeeded' and p.direction = 'in' then p.amount_cents
        when p.status = 'succeeded' and p.direction = 'out' then -p.amount_cents
        else 0
      end
    ), 0),
    max(case when p.status = 'succeeded' and p.direction = 'in' then p.paid_at else null end)
  into _paid, _last
  from public.invoice_payments p
  where p.invoice_id = p_invoice_id;

  _paid := greatest(0, coalesce(_paid, 0));

  -- Status rollup:
  -- - never touch canceled/void
  -- - never auto-issue a draft invoice (avoid numbering surprises)
  _next_status := _inv.status;
  if _inv.status not in ('void','canceled','draft') and coalesce(_inv.total_cents, 0) > 0 then
    if _paid >= coalesce(_inv.total_cents, 0) and _paid > 0 then
      _next_status := 'paid';
    elsif _paid > 0 and _paid < coalesce(_inv.total_cents, 0) then
      _next_status := 'partially_paid';
    end if;
  end if;

  update public.factures
  set paid_cents = _paid,
      last_payment_at = _last,
      status = _next_status,
      paid_at = case
        when _next_status = 'paid' and coalesce(paid_at, to_timestamp(0)) = to_timestamp(0) then now()
        else paid_at
      end,
      updated_at = now()
  where id = p_invoice_id;
end;
$$;

grant execute on function app.recalc_facture_payments(uuid) to authenticated, anon;

create or replace function app.on_invoice_payments_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app.recalc_facture_payments(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

grant execute on function app.on_invoice_payments_write() to authenticated, anon;

drop trigger if exists trg_invoice_payments_recalc on public.invoice_payments;
create trigger trg_invoice_payments_recalc
after insert or update or delete on public.invoice_payments
for each row execute function app.on_invoice_payments_write();

-- Optional: when invoice total changes, recompute rollup (no recursion because total_cents is unchanged by recalc).
create or replace function app.on_facture_total_change_recalc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.total_cents, 0) <> coalesce(old.total_cents, 0) then
    perform app.recalc_facture_payments(new.id);
  end if;
  return new;
end;
$$;

grant execute on function app.on_facture_total_change_recalc() to authenticated, anon;

drop trigger if exists trg_factures_recalc_payments on public.factures;
create trigger trg_factures_recalc_payments
after update of total_cents on public.factures
for each row execute function app.on_facture_total_change_recalc();

-- RLS
alter table public.invoice_payments enable row level security;
alter table public.invoice_payments force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='invoice_payments' and policyname='invoice_payments_select_member'
  ) then
    create policy invoice_payments_select_member
      on public.invoice_payments
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='invoice_payments' and policyname='invoice_payments_write_admin'
  ) then
    create policy invoice_payments_write_admin
      on public.invoice_payments
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

