-- 017_saas_modules_and_subscription_gate.sql
-- Add plan modules, allow subscription read for members (UI gating),
-- and sync organization_entitlements from organization_subscriptions.

create schema if not exists app;

-- Allow org members to read subscription status (needed for app gating for technicians/viewers).
do $$
begin
  if to_regclass('public.organization_subscriptions') is not null and not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_subscriptions' and policyname='organization_subscriptions_select_member'
  ) then
    create policy organization_subscriptions_select_member
      on public.organization_subscriptions
      for select
      using (app.is_org_member(organization_id));
  end if;
end
$$;

-- Billing plans: add module bundles + Stripe price ids (optional, filled later).
alter table if exists public.billing_plans
  add column if not exists description text;

alter table if exists public.billing_plans
  add column if not exists modules jsonb not null default '{}'::jsonb;

alter table if exists public.billing_plans
  add column if not exists limits jsonb not null default '{}'::jsonb;

alter table if exists public.billing_plans
  add column if not exists stripe_price_monthly_id text;

alter table if exists public.billing_plans
  add column if not exists stripe_price_annual_id text;

-- Ensure Stripe ids are not duplicated accidentally.
create unique index if not exists organization_subscriptions_provider_uidx
  on public.organization_subscriptions (provider, provider_subscription_id)
  where provider is not null
    and provider <> ''
    and provider_subscription_id is not null
    and provider_subscription_id <> '';

-- Default module bundles for existing plan codes (adjust as you wish).
update public.billing_plans
set
  name = case
    when code = 'starter' then 'Facturation'
    when code = 'growth' then 'Facturation + Interventions'
    when code = 'scale' then 'Entreprise'
    else name
  end,
  description = case
    when code = 'starter' then coalesce(description, 'Devis, factures, clients.')
    when code = 'growth' then coalesce(description, 'Facturation + interventions terrain.')
    when code = 'scale' then coalesce(description, 'Offre entreprise (personnalisable).')
    else description
  end,
  modules = case
    when code = 'starter' then jsonb_build_object('billing', true, 'interventions', false)
    when code in ('growth','scale') then jsonb_build_object('billing', true, 'interventions', true)
    else modules
  end
where code in ('starter','growth','scale');

-- Safer module helper: missing key => false.
create or replace function app.org_has_module(p_org uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (modules ->> p_module)::boolean
      from public.organization_entitlements e
      where e.organization_id = p_org
    ),
    false
  );
$$;

grant execute on function app.org_has_module(uuid, text) to authenticated, anon;

-- Active subscription helper.
create or replace function app.org_has_active_subscription(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_subscriptions s
    where s.organization_id = p_org
      and s.status in ('trialing','active','past_due')
      and (s.ends_at is null or s.ends_at > now())
      and (s.status <> 'trialing' or s.trial_ends_at is null or s.trial_ends_at > now())
  );
$$;

grant execute on function app.org_has_active_subscription(uuid) to authenticated, anon;

-- Sync entitlements.modules with subscription plan modules to keep everything consistent.
create or replace function app.sync_entitlements_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _active boolean;
  _modules jsonb;
begin
  _org := coalesce(new.organization_id, old.organization_id);
  if _org is null then
    return coalesce(new, old);
  end if;

  _active := (tg_op <> 'DELETE')
    and new.status in ('trialing','active','past_due')
    and (new.ends_at is null or new.ends_at > now())
    and (new.status <> 'trialing' or new.trial_ends_at is null or new.trial_ends_at > now());

  if _active then
    select coalesce(bp.modules, '{}'::jsonb) into _modules
    from public.billing_plans bp
    where bp.id = new.plan_id;
  else
    _modules := '{}'::jsonb;
  end if;

  insert into public.organization_entitlements (organization_id, modules, limits)
  values (_org, _modules, '{}'::jsonb)
  on conflict (organization_id)
  do update
  set modules = excluded.modules,
      updated_at = now();

  return coalesce(new, old);
end;
$$;

grant execute on function app.sync_entitlements_from_subscription() to authenticated, anon;

drop trigger if exists trg_sync_entitlements_from_subscription on public.organization_subscriptions;
create trigger trg_sync_entitlements_from_subscription
after insert or update of status, plan_id, ends_at, trial_ends_at or delete on public.organization_subscriptions
for each row execute function app.sync_entitlements_from_subscription();

-- Bootstrap new orgs with NO modules until a subscription exists.
create or replace function app.bootstrap_organization_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_profiles (organization_id, legal_name, trade_name, email)
  values (new.id, new.name, new.name, new.billing_email)
  on conflict (organization_id) do nothing;

  insert into public.organization_entitlements (organization_id, modules, limits)
  values (
    new.id,
    jsonb_build_object('billing', false, 'interventions', false),
    '{}'::jsonb
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

grant execute on function app.bootstrap_organization_rows() to authenticated, anon;

drop trigger if exists trg_bootstrap_organization_rows on public.organizations;
create trigger trg_bootstrap_organization_rows
after insert on public.organizations
for each row execute function app.bootstrap_organization_rows();

-- Sync entitlements once for existing subscription rows (no-op if none).
update public.organization_subscriptions
set status = status
where id is not null;
