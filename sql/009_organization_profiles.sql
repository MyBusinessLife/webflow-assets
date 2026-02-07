-- 009_organization_profiles.sql
-- Company legal profile + invoicing defaults (FR ready).

create schema if not exists app;

create table if not exists public.organization_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  -- Legal / identity
  legal_name text,
  trade_name text,
  legal_form text,
  share_capital_cents int8,
  siret text,
  vat_number text,
  rcs_city text,
  rcs_number text,
  naf_code text,

  -- Contact / address
  address text,
  postal_code text,
  city text,
  country text,
  email text,
  phone text,

  -- Invoice defaults
  invoice_prefix text not null default 'FA',
  invoice_padding int4 not null default 4,
  quote_prefix text not null default 'DV',
  quote_padding int4 not null default 4,

  payment_terms_days int4 not null default 30,
  late_fee_rate numeric not null default 10.0,
  recovery_fee_cents int8 not null default 4000,
  vat_exemption_text text, -- ex: "TVA non applicable, art. 293 B du CGI"

  footer_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_profiles_updated_at_idx
  on public.organization_profiles (updated_at desc);

-- Touch helper (generic).
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

grant execute on function app.touch_updated_at() to authenticated, anon;

drop trigger if exists trg_touch_org_profiles on public.organization_profiles;
create trigger trg_touch_org_profiles
before update on public.organization_profiles
for each row execute function app.touch_updated_at();

-- Bootstrap one row per org (best-effort from organizations table).
insert into public.organization_profiles (organization_id, legal_name, trade_name, email)
select o.id, o.name, o.name, o.billing_email
from public.organizations o
where not exists (
  select 1 from public.organization_profiles p where p.organization_id = o.id
);

-- RLS
alter table public.organization_profiles enable row level security;
alter table public.organization_profiles force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_profiles' and policyname='organization_profiles_select_member'
  ) then
    create policy organization_profiles_select_member
      on public.organization_profiles
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_profiles' and policyname='organization_profiles_write_admin'
  ) then
    create policy organization_profiles_write_admin
      on public.organization_profiles
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

