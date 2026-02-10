-- 039_plan_ultimate_include_rental.sql
-- Include the short-stay rental ("hotellerie") module in the "ultimate" (tout inclus) plan.
-- Also resync organization_entitlements for orgs already subscribed to this plan.
--
-- Idempotent: safe to re-run.

-- 1) Update plan bundle
update public.billing_plans
set
  description = 'Tout inclus: facturation + interventions + transport + hotellerie.',
  modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{rental}', 'true'::jsonb, true),
  updated_at = now()
where code = 'ultimate';

-- 2) Resync entitlements for existing subscribers to ultimate
-- (the sync trigger is on organization_subscriptions, not billing_plans)
update public.organization_subscriptions s
set status = s.status
from public.billing_plans p
where p.code = 'ultimate'
  and s.plan_id = p.id;

