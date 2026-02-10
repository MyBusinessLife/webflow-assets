-- 035_plan_restaurant_pos.sql
-- Add a dedicated "Restaurant" offer (restaurant + POS) as its own billing plan.
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
  'restaurant',
  'Restaurant',
  9900,
  99000,
  'Restauration + POS (catalogue, commandes, encaissement).',
  jsonb_build_object(
    'billing', true,
    'restaurant', true,
    'interventions', false,
    'transport', false,
    'fleet', false,
    'logistics', false,
    'rental', false
  ),
  jsonb_build_object('max_users', 20),
  true
where not exists (select 1 from public.billing_plans where code = 'restaurant');

-- Keep it updated if it already exists.
update public.billing_plans
set
  name = 'Restaurant',
  monthly_price_cents = 9900,
  annual_price_cents = 99000,
  description = 'Restauration + POS (catalogue, commandes, encaissement).',
  modules = jsonb_build_object(
    'billing', true,
    'restaurant', true,
    'interventions', false,
    'transport', false,
    'fleet', false,
    'logistics', false,
    'rental', false
  ),
  limits = case
    when limits is null or limits = '{}'::jsonb then jsonb_build_object('max_users', 20)
    else limits
  end,
  updated_at = now()
where code = 'restaurant';

