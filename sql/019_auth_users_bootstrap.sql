-- 019_auth_users_bootstrap.sql
-- Automatically bootstrap multi-tenant rows for newly created Supabase Auth users.
--
-- Goal:
-- - Every new user gets:
--   - a personal organization (public.organizations)
--   - an owner membership (public.organization_members)
--   - a profile row (public.profiles)
--
-- This is the simplest, most reliable SaaS onboarding for Webflow + Supabase:
-- signup/login (email OR Google) => always has org + profile => no "stuck" sessions.
--
-- Notes:
-- - If you later add an invitation system, you can adapt this to:
--   - prefer matching a pending invite (join existing org)
--   - only create a new org if no invite exists

create extension if not exists pgcrypto;
create schema if not exists app;

-- Create a human-friendly base slug from a label (best effort).
create or replace function app.slug_base(p_label text)
returns text
language sql
immutable
as $$
  select
    case
      when p_label is null or btrim(p_label) = '' then 'org'
      else nullif(
        btrim(
          regexp_replace(
            regexp_replace(lower(p_label), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)',
            '',
            'g'
          ),
          '-'
        ),
        ''
      )
    end;
$$;

-- Trigger function: runs when a new auth.users row is created.
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _email text;
  _full_name text;
  _first_name text;
  _last_name text;
  _company_name text;
  _org_name text;
  _base text;
  _slug text;
  _org_id uuid;
  _i int;
begin
  _email := coalesce(new.email, '');

  _full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
  _first_name := coalesce(new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'first_name', '');
  _last_name := coalesce(new.raw_user_meta_data->>'family_name', new.raw_user_meta_data->>'last_name', '');
  _company_name := coalesce(
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'company',
    new.raw_user_meta_data->>'organisation',
    new.raw_user_meta_data->>'organization',
    new.raw_user_meta_data->>'business_name',
    ''
  );

  -- Fallback name split if Google didn't provide given/family name explicitly.
  if coalesce(_first_name, '') = '' and coalesce(_last_name, '') = '' and coalesce(_full_name, '') <> '' then
    _first_name := split_part(_full_name, ' ', 1);
    _last_name := nullif(btrim(replace(_full_name, _first_name, '')), '');
  end if;

  -- Idempotency: if the user already has a membership, don't create another org.
  if exists (select 1 from public.organization_members om where om.user_id = new.id) then
    insert into public.profiles (id, email, role, user_type, first_name, last_name, name, created_at, updated_at)
    values (
      new.id,
      new.email,
      'admin',
      'internal',
      nullif(_first_name, ''),
      nullif(_last_name, ''),
      nullif(_full_name, ''),
      now(),
      now()
    )
    on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
    return new;
  end if;

  _org_name := coalesce(
    nullif(_company_name, ''),
    nullif(split_part(_email, '@', 1), ''),
    'Mon organisation'
  );
  _base := coalesce(app.slug_base(_org_name), 'org');

  _org_id := null;
  for _i in 1..10 loop
    _slug := left(_base, 32) || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6);
    begin
      insert into public.organizations (slug, name, billing_email)
      values (_slug, _org_name, new.email)
      returning id into _org_id;
      exit;
    exception when unique_violation then
      _org_id := null;
    end;
  end loop;

  if _org_id is null then
    raise exception 'Unable to create organization for new user.';
  end if;

  insert into public.organization_members (organization_id, user_id, role, is_default, is_active)
  values (_org_id, new.id, 'owner'::public.org_member_role, true, true)
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      is_default = excluded.is_default,
      is_active = excluded.is_active,
      updated_at = now();

  insert into public.profiles (id, email, role, user_type, first_name, last_name, name, organization_id, created_at, updated_at)
  values (
    new.id,
    new.email,
    'admin',
    'internal',
    nullif(_first_name, ''),
    nullif(_last_name, ''),
    nullif(_full_name, ''),
    _org_id,
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      organization_id = coalesce(public.profiles.organization_id, excluded.organization_id),
      updated_at = now();

  return new;
end;
$$;

-- Attach trigger (idempotent).
drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
after insert on auth.users
for each row execute function app.handle_new_auth_user();

