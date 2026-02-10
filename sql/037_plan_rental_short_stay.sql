-- 037_plan_rental_short_stay.sql
-- Add a dedicated offer for short-stay rentals (annonces + calendrier + reservations publiques).
--
-- Notes:
-- - Price values are placeholders (you can adjust later).
-- - Safe to re-run (idempotent).

alter table if exists public.billing_plans
  add column if not exists description text;

alter table if exists public.billing_plans
  add column if not exists modules jsonb not null default '{}'::jsonb;

alter table if exists public.billing_plans
  add column if not exists limits jsonb not null default '{}'::jsonb;

-- Create plan if missing.
insert into public.billing_plans (
  code,
  name,
  monthly_price_cents,
  annual_price_cents,
  description,
  modules,
  limits,
  is_active
)
select
  'rental',
  'Location courte duree',
  14900,
  149000,
  'Annonces, reservations de nuits, calendrier, gestion client et operations.',
  jsonb_build_object(
    'billing', true,
    'rental', true,
    'restaurant', false,
    'interventions', false,
    'transport', false,
    'fleet', false,
    'logistics', false
  ),
  jsonb_build_object('max_users', 20),
  true
where not exists (select 1 from public.billing_plans where code = 'rental');

-- Keep it updated if it already exists.
update public.billing_plans
set
  name = 'Location courte duree',
  monthly_price_cents = 14900,
  annual_price_cents = 149000,
  description = 'Annonces, reservations de nuits, calendrier, gestion client et operations.',
  modules = jsonb_build_object(
    'billing', true,
    'rental', true,
    'restaurant', false,
    'interventions', false,
    'transport', false,
    'fleet', false,
    'logistics', false
  ),
  limits = case
    when limits is null or limits = '{}'::jsonb then jsonb_build_object('max_users', 20)
    else limits
  end,
  updated_at = now()
where code = 'rental';

