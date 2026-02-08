-- 018_user_limits_max_users.sql
-- Add user quota support (max users per organization) using plan limits.
--
-- Data model:
-- - public.billing_plans.limits (jsonb) can contain: { "max_users": 5 }
-- - public.organization_entitlements.limits (jsonb) stores the effective limits for an org
--   and is synced from the active subscription plan.
--
-- Enforcement:
-- - A trigger on public.organization_members prevents INSERT / activation beyond max_users.
--
-- Notes:
-- - If max_users is missing, null, or <= 0 => unlimited (backward compatible).
-- - This enforces ACTIVE members only (organization_members.is_active = true).

create schema if not exists app;

-- Safe parse helper: returns NULL if not a positive integer string.
create or replace function app.safe_int8(p_text text)
returns int8
language plpgsql
immutable
as $$
begin
  if p_text is null then
    return null;
  end if;

  if p_text ~ '^[0-9]+$' then
    return p_text::int8;
  end if;

  return null;
end;
$$;

-- Read effective max users for an organization from organization_entitlements.limits.
create or replace function app.org_max_users(p_org uuid)
returns int8
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when e.limits ? 'max_users' then
        nullif(app.safe_int8(e.limits->>'max_users'), 0)
      else null
    end
  from public.organization_entitlements e
  where e.organization_id = p_org;
$$;

grant execute on function app.org_max_users(uuid) to authenticated, anon;

-- Count active members (is_active=true) for an organization.
create or replace function app.org_active_member_count(p_org uuid)
returns int8
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int8
  from public.organization_members om
  where om.organization_id = p_org
    and om.is_active = true;
$$;

grant execute on function app.org_active_member_count(uuid) to authenticated, anon;

-- Sync entitlements.modules + entitlements.limits from subscription plan.
-- Overrides previous implementation from 017 to also propagate limits.
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
  _limits jsonb;
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
    select
      coalesce(bp.modules, '{}'::jsonb),
      coalesce(bp.limits, '{}'::jsonb)
    into _modules, _limits
    from public.billing_plans bp
    where bp.id = new.plan_id;
  else
    _modules := '{}'::jsonb;
    _limits := '{}'::jsonb;
  end if;

  insert into public.organization_entitlements (organization_id, modules, limits)
  values (_org, _modules, _limits)
  on conflict (organization_id)
  do update
  set
    modules = excluded.modules,
    limits = excluded.limits,
    updated_at = now();

  return coalesce(new, old);
end;
$$;

grant execute on function app.sync_entitlements_from_subscription() to authenticated, anon;

-- Enforce max_users on organization_members.
create or replace function app.enforce_org_max_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _limit int8;
  _active_count int8;
  _is_increase boolean := false;
begin
  if tg_op = 'INSERT' then
    _org := new.organization_id;
    _is_increase := coalesce(new.is_active, true);
  elsif tg_op = 'UPDATE' then
    _org := new.organization_id;

    -- Only enforce when this change increases active users for the target org:
    -- - inactive -> active in same org
    -- - moving an active member to another org (rare, but safe)
    if old.organization_id is distinct from new.organization_id then
      _is_increase := coalesce(new.is_active, false);
    else
      if coalesce(old.is_active, false) = false and coalesce(new.is_active, false) = true then
        _is_increase := true;
      end if;
    end if;
  else
    return coalesce(new, old);
  end if;

  if not _is_increase or _org is null then
    return coalesce(new, old);
  end if;

  -- Serialize concurrent inserts/activations using the entitlements row lock.
  perform 1
  from public.organization_entitlements e
  where e.organization_id = _org
  for update;

  _limit := app.org_max_users(_org);

  -- Missing/0 => unlimited.
  if _limit is null or _limit <= 0 then
    return coalesce(new, old);
  end if;

  select count(*)::int8
  into _active_count
  from public.organization_members om
  where om.organization_id = _org
    and om.is_active = true;

  -- Active count is checked BEFORE the new row becomes active, so ">=" is correct.
  if _active_count >= _limit then
    raise exception 'User limit reached for this organization (max_users=%).', _limit
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_org_max_users on public.organization_members;
create trigger trg_enforce_org_max_users
before insert or update of is_active, organization_id on public.organization_members
for each row execute function app.enforce_org_max_users();

-- Faster counts
create index if not exists organization_members_org_active_idx
  on public.organization_members (organization_id)
  where is_active = true;

-- Keep entitlements in sync when a plan definition changes (modules/limits).
-- This is useful while iterating on your SaaS offers.
create or replace function app.sync_entitlements_from_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organization_entitlements e
  set
    modules = coalesce(new.modules, '{}'::jsonb),
    limits  = coalesce(new.limits, '{}'::jsonb),
    updated_at = now()
  from public.organization_subscriptions s
  where s.organization_id = e.organization_id
    and s.plan_id = new.id
    and s.status in ('trialing','active','past_due')
    and (s.ends_at is null or s.ends_at > now())
    and (s.status <> 'trialing' or s.trial_ends_at is null or s.trial_ends_at > now());

  return new;
end;
$$;

drop trigger if exists trg_sync_entitlements_from_plan on public.billing_plans;
create trigger trg_sync_entitlements_from_plan
after update of modules, limits on public.billing_plans
for each row execute function app.sync_entitlements_from_plan();

-- Resync entitlements once for existing subscription rows.
update public.organization_subscriptions
set status = status
where id is not null;
