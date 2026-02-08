-- 022_plans_transport_and_ultimate.sql
-- Add 2 new offers:
-- - "transport": facturation + module transport (sans interventions)
-- - "ultimate": tout inclus (facturation + interventions + transport)
--
-- Notes:
-- - Idempotent: safe to re-run.
-- - We only touch rows for these 2 plan codes.

alter table if exists public.billing_plans
  add column if not exists description text;

alter table if exists public.billing_plans
  add column if not exists modules jsonb not null default '{}'::jsonb;

alter table if exists public.billing_plans
  add column if not exists limits jsonb not null default '{}'::jsonb;

-- =========================
-- Plan: Transport
-- =========================
insert into public.billing_plans (code, name, monthly_price_cents, annual_price_cents, description, modules, limits, is_active)
select
  'transport',
  'Transport',
  19900,
  199000,
  'Offre transport: facturation + flotte, tournees, courses, tarifs et estimations.',
  jsonb_build_object('billing', true, 'interventions', false, 'transport', true),
  jsonb_build_object('max_users', 50),
  true
where not exists (select 1 from public.billing_plans where code = 'transport');

update public.billing_plans
set
  name = 'Transport',
  monthly_price_cents = 19900,
  annual_price_cents = 199000,
  description = 'Offre transport: facturation + flotte, tournees, courses, tarifs et estimations.',
  modules = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(modules, '{}'::jsonb), '{billing}', 'true'::jsonb, true),
      '{transport}',
      'true'::jsonb,
      true
    ),
    '{interventions}',
    'false'::jsonb,
    true
  ),
  limits = case
    when limits is null or limits = '{}'::jsonb then jsonb_build_object('max_users', 50)
    else limits
  end,
  updated_at = now()
where code = 'transport';

-- =========================
-- Plan: Ultimate (Tout inclus)
-- =========================
insert into public.billing_plans (code, name, monthly_price_cents, annual_price_cents, description, modules, limits, is_active)
select
  'ultimate',
  'Tout inclus',
  49900,
  499000,
  'Tout inclus: facturation + interventions + transport (offre maximale).',
  jsonb_build_object('billing', true, 'interventions', true, 'transport', true),
  jsonb_build_object('max_users', 200),
  true
where not exists (select 1 from public.billing_plans where code = 'ultimate');

update public.billing_plans
set
  name = 'Tout inclus',
  monthly_price_cents = 49900,
  annual_price_cents = 499000,
  description = 'Tout inclus: facturation + interventions + transport (offre maximale).',
  modules = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(modules, '{}'::jsonb), '{billing}', 'true'::jsonb, true),
      '{interventions}',
      'true'::jsonb,
      true
    ),
    '{transport}',
    'true'::jsonb,
    true
  ),
  limits = case
    when limits is null or limits = '{}'::jsonb then jsonb_build_object('max_users', 200)
    else limits
  end,
  updated_at = now()
where code = 'ultimate';

