-- 010_clients_billing_fields.sql
-- Add billing-ready fields to clients for invoices (FR).

alter table if exists public.clients add column if not exists legal_name text;
alter table if exists public.clients add column if not exists siret text;
alter table if exists public.clients add column if not exists vat_number text;

alter table if exists public.clients add column if not exists billing_address text;
alter table if exists public.clients add column if not exists billing_city text;
alter table if exists public.clients add column if not exists billing_postal_code text;
alter table if exists public.clients add column if not exists billing_country text;

alter table if exists public.clients add column if not exists payment_terms_days int4;
alter table if exists public.clients add column if not exists late_fee_rate numeric;
alter table if exists public.clients add column if not exists recovery_fee_cents int8;

alter table if exists public.clients add column if not exists is_vat_exempt bool not null default false;
alter table if exists public.clients add column if not exists vat_exemption_text text;

create index if not exists clients_org_email_idx
  on public.clients (organization_id, email)
  where email is not null and email <> '';

