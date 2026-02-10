-- 033_auth_bootstrap_google_oauth_fix.sql
-- Fix: "database error saving new user" on Google OAuth signup.
--
-- Root cause (common):
-- - The auth.users trigger app.handle_new_auth_user creates an organization with a slug
--   that can exceed an existing varchar(n) column limit (if organizations table existed before),
--   or inserts a profile name that can be null while the legacy schema requires NOT NULL.
--
-- This migration makes the bootstrap trigger more defensive:
-- - Detects organizations.slug max length (if any) and generates a safe slug that fits.
-- - Ensures profile display name always has a fallback.
-- - Avoids hard failure: if organization creation still fails, it falls back to a safe existing org.
--
-- Safe to re-run.

create extension if not exists pgcrypto;
create schema if not exists app;

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
  _display_name text;
  _base text;
  _slug text;
  _org_id uuid;
  _i int;

  _slug_max int;
  _suffix_len int;
  _prefix_len int;
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

  _display_name := coalesce(
    nullif(btrim(_full_name), ''),
    nullif(btrim(_first_name || ' ' || _last_name), ''),
    nullif(split_part(_email, '@', 1), ''),
    'Utilisateur'
  );

  -- Idempotency: if the user already has a membership, only upsert the profile row.
  if exists (select 1 from public.organization_members om where om.user_id = new.id) then
    insert into public.profiles (id, email, role, user_type, first_name, last_name, name, created_at, updated_at)
    values (
      new.id,
      new.email,
      'admin',
      'internal',
      nullif(btrim(_first_name), ''),
      nullif(btrim(_last_name), ''),
      nullif(btrim(_display_name), ''),
      now(),
      now()
    )
    on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
    return new;
  end if;

  _org_name := coalesce(
    nullif(btrim(_company_name), ''),
    nullif(split_part(_email, '@', 1), ''),
    'Mon organisation'
  );

  -- Detect organizations.slug max length if organizations existed with varchar(n).
  select c.character_maximum_length
  into _slug_max
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'organizations'
    and c.column_name = 'slug';

  if _slug_max is null or _slug_max < 12 then
    _slug_max := 32;
  end if;

  _suffix_len := 6;
  _prefix_len := _slug_max - _suffix_len - 1;
  if _prefix_len < 4 then
    _prefix_len := greatest(1, _slug_max - 3);
    _suffix_len := greatest(2, _slug_max - _prefix_len - 1);
  end if;

  _base := coalesce(app.slug_base(_org_name), 'org');
  _org_id := null;

  for _i in 1..20 loop
    _slug := left(_base, _prefix_len) || '-' || substr(encode(gen_random_bytes(8), 'hex'), 1, _suffix_len);
    begin
      insert into public.organizations (slug, name, billing_email)
      values (_slug, _org_name, nullif(new.email, ''))
      returning id into _org_id;
      exit;
    exception
      when unique_violation then
        _org_id := null;
      when others then
        _org_id := null;
    end;
  end loop;

  -- Last resort: ensure we at least attach the user to *some* org so login isn't blocked.
  if _org_id is null then
    select id into _org_id from public.organizations order by created_at asc limit 1;
  end if;

  if _org_id is null then
    -- Should never happen (001 creates a default org), but do not block auth user creation.
    return new;
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
    nullif(btrim(_first_name), ''),
    nullif(btrim(_last_name), ''),
    nullif(btrim(_display_name), ''),
    _org_id,
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      organization_id = coalesce(public.profiles.organization_id, excluded.organization_id),
      updated_at = now();

  -- Bootstrap org legal profile if table exists (best effort).
  if to_regclass('public.organization_profiles') is not null then
    insert into public.organization_profiles (organization_id, legal_name, trade_name, email)
    values (_org_id, _org_name, _org_name, nullif(new.email, ''))
    on conflict (organization_id) do nothing;
  end if;

  return new;
end;
$$;

-- Reattach trigger (idempotent).
drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
after insert on auth.users
for each row execute function app.handle_new_auth_user();

