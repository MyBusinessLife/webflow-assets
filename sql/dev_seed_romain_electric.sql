-- dev_seed_romain_electric.sql
-- Seed de test:
-- - Cree/maj l'admin:    romainbnqr@free.fr
-- - Cree/maj l'employe:  romain@test.fr
-- - Rattache les 2 comptes a l'organisation "Romain Electric"
-- - Force un abonnement maximal (ultimate -> fallback scale)
--
-- IMPORTANT:
-- - A executer dans Supabase SQL Editor (role postgres/service_role).
-- - A utiliser uniquement pour les environnements de test.

create extension if not exists pgcrypto;
create schema if not exists app;

do $$
declare
  _owner_email text := 'romainbnqr@free.fr';
  _employee_email text := 'romain@test.fr';
  _owner_password text := 'Romain#Test2026!';
  _employee_password text := 'Employe#Test2026!';
  _org_name text := 'Romain Electric';

  _owner_id uuid;
  _employee_id uuid;
  _org_id uuid;
  _plan_id uuid;
  _plan_modules jsonb := '{}'::jsonb;
  _plan_limits jsonb := '{}'::jsonb;
  _manual_ref text;
  _sub_id uuid;
  _slug_base text;
  _org_slug text;
begin
  -- =====================================
  -- 1) Owner auth user
  -- =====================================
  select u.id into _owner_id
  from auth.users u
  where lower(u.email) = lower(_owner_email)
  limit 1;

  if _owner_id is null then
    _owner_id := gen_random_uuid();

    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      _owner_id,
      'authenticated',
      'authenticated',
      _owner_email,
      crypt(_owner_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'Romain', 'last_name', 'Electric', 'full_name', 'Romain Electric', 'company_name', _org_name),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = crypt(_owner_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = _owner_id;
  end if;

  -- =====================================
  -- 2) Organization "Romain Electric"
  -- =====================================
  select o.id into _org_id
  from public.organizations o
  where lower(o.name) = lower(_org_name)
  order by o.created_at asc
  limit 1;

  if _org_id is null then
    _slug_base := nullif(
      btrim(
        regexp_replace(
          regexp_replace(lower(_org_name), '[^a-z0-9]+', '-', 'g'),
          '(^-+|-+$)',
          '',
          'g'
        ),
        '-'
      ),
      ''
    );
    if _slug_base is null then
      _slug_base := 'romain-electric';
    end if;
    _org_slug := left(_slug_base, 36) || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6);

    insert into public.organizations (slug, name, plan_code, billing_email, is_active, created_at, updated_at)
    values (_org_slug, _org_name, 'ultimate', _owner_email, true, now(), now())
    returning id into _org_id;
  end if;

  update public.organizations
  set name = _org_name,
      billing_email = _owner_email,
      plan_code = 'ultimate',
      is_active = true,
      updated_at = now()
  where id = _org_id;

  -- Owner membership as default owner in this org.
  update public.organization_members
  set is_default = false,
      updated_at = now()
  where user_id = _owner_id
    and is_default = true
    and organization_id <> _org_id;

  insert into public.organization_members (organization_id, user_id, role, is_default, is_active, created_at, updated_at)
  values (_org_id, _owner_id, 'owner', true, true, now(), now())
  on conflict (organization_id, user_id)
  do update
  set role = 'owner',
      is_default = true,
      is_active = true,
      updated_at = now();

  insert into public.profiles (id, email, role, user_type, first_name, last_name, name, organization_id, created_at, updated_at)
  values (_owner_id, _owner_email, 'admin', 'internal', 'Romain', 'Electric', 'Romain Electric', _org_id, now(), now())
  on conflict (id)
  do update
  set email = excluded.email,
      role = 'admin',
      user_type = 'internal',
      first_name = 'Romain',
      last_name = 'Electric',
      name = 'Romain Electric',
      organization_id = _org_id,
      updated_at = now();

  -- =====================================
  -- 3) Max subscription (ultimate -> scale)
  -- =====================================
  select bp.id, coalesce(bp.modules, '{}'::jsonb), coalesce(bp.limits, '{}'::jsonb)
  into _plan_id, _plan_modules, _plan_limits
  from public.billing_plans bp
  where bp.code in ('ultimate', 'scale')
  order by case when bp.code = 'ultimate' then 0 else 1 end
  limit 1;

  if _plan_id is null then
    raise exception 'Plan introuvable: execute d abord les migrations des plans (022/023/024).';
  end if;

  _manual_ref := 'manual-' || _org_id::text;

  update public.organization_subscriptions
  set status = 'canceled',
      ends_at = now(),
      updated_at = now()
  where organization_id = _org_id
    and status in ('trialing', 'active', 'past_due');

  select s.id into _sub_id
  from public.organization_subscriptions s
  where s.organization_id = _org_id
    and coalesce(s.provider, '') = 'manual'
    and coalesce(s.provider_subscription_id, '') = _manual_ref
  order by s.created_at desc
  limit 1;

  if _sub_id is null then
    insert into public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      starts_at,
      ends_at,
      trial_ends_at,
      provider,
      provider_customer_id,
      provider_subscription_id,
      created_at,
      updated_at
    )
    values (
      _org_id,
      _plan_id,
      'active',
      now(),
      null,
      null,
      'manual',
      _manual_ref,
      _manual_ref,
      now(),
      now()
    );
  else
    update public.organization_subscriptions
    set plan_id = _plan_id,
        status = 'active',
        starts_at = now(),
        ends_at = null,
        trial_ends_at = null,
        updated_at = now()
    where id = _sub_id;
  end if;

  -- Keep entitlements in sync even if trigger was not installed.
  insert into public.organization_entitlements (organization_id, modules, limits, created_at, updated_at)
  values (_org_id, _plan_modules, _plan_limits, now(), now())
  on conflict (organization_id)
  do update
  set modules = excluded.modules,
      limits = excluded.limits,
      updated_at = now();

  -- =====================================
  -- 4) Employee user (romain@test.fr)
  -- =====================================
  if to_regclass('public.organization_invitations') is not null then
    update public.organization_invitations
    set status = 'revoked',
        revoked_at = now(),
        updated_at = now()
    where organization_id = _org_id
      and lower(email) = lower(_employee_email)
      and status = 'pending';

    insert into public.organization_invitations (
      organization_id,
      email,
      role,
      user_type,
      permissions_mode,
      permissions,
      status,
      invited_by,
      invited_at,
      expires_at,
      note,
      created_at,
      updated_at
    )
    values (
      _org_id,
      _employee_email,
      'viewer',
      'internal',
      'inherit',
      '{}'::jsonb,
      'pending',
      _owner_id,
      now(),
      now() + interval '30 days',
      'Seed test employee',
      now(),
      now()
    );
  end if;

  select u.id into _employee_id
  from auth.users u
  where lower(u.email) = lower(_employee_email)
  limit 1;

  if _employee_id is null then
    _employee_id := gen_random_uuid();

    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      _employee_id,
      'authenticated',
      'authenticated',
      _employee_email,
      crypt(_employee_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('first_name', 'Romain', 'last_name', 'Employe', 'full_name', 'Romain Employe'),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = crypt(_employee_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = _employee_id;
  end if;

  -- Force employee in Romain Electric org.
  update public.organization_members
  set is_default = false,
      updated_at = now()
  where user_id = _employee_id
    and is_default = true
    and organization_id <> _org_id;

  insert into public.organization_members (organization_id, user_id, role, is_default, is_active, created_at, updated_at)
  values (_org_id, _employee_id, 'viewer', true, true, now(), now())
  on conflict (organization_id, user_id)
  do update
  set role = 'viewer',
      is_default = true,
      is_active = true,
      updated_at = now();

  insert into public.profiles (id, email, role, user_type, first_name, last_name, name, organization_id, created_at, updated_at)
  values (_employee_id, _employee_email, 'viewer', 'internal', 'Romain', 'Employe', 'Romain Employe', _org_id, now(), now())
  on conflict (id)
  do update
  set email = excluded.email,
      role = 'viewer',
      user_type = 'internal',
      first_name = coalesce(public.profiles.first_name, 'Romain'),
      last_name = coalesce(public.profiles.last_name, 'Employe'),
      name = coalesce(public.profiles.name, 'Romain Employe'),
      organization_id = _org_id,
      updated_at = now();

  if to_regclass('public.organization_invitations') is not null then
    update public.organization_invitations
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now()),
        accepted_by = coalesce(accepted_by, _employee_id),
        updated_at = now()
    where organization_id = _org_id
      and lower(email) = lower(_employee_email)
      and status = 'pending';
  end if;
end
$$;

-- Quick verification
select o.id, o.name, o.plan_code, o.billing_email
from public.organizations o
where lower(o.name) = lower('Romain Electric');

select p.id, p.email, p.role, p.user_type, p.organization_id
from public.profiles p
where lower(p.email) in (lower('romainbnqr@free.fr'), lower('romain@test.fr'))
order by p.email;

select s.organization_id, bp.code as plan_code, s.status, s.starts_at, s.ends_at
from public.organization_subscriptions s
join public.billing_plans bp on bp.id = s.plan_id
where s.organization_id in (
  select id from public.organizations where lower(name) = lower('Romain Electric')
)
order by s.created_at desc;
