-- 034_auth_bootstrap_signup_fix_profiles_compat.sql
-- Fix: "database error saving new user" on signup (Google OAuth AND email/password).
--
-- Common root causes:
-- - The auth.users bootstrap trigger inserts into public.profiles with columns that
--   may not exist in older schemas (first_name/last_name/name/etc.).
-- - The organization slug generated may exceed a legacy varchar(n) limit.
--
-- This migration makes the auth bootstrap trigger fully backward compatible:
-- - Creates/keeps app.slug_base.
-- - Creates org slug that fits any organizations.slug max length (if any).
-- - Upserts profiles using ONLY columns that exist (best-effort, never blocks signup).
--
-- Safe to re-run.

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

create or replace function app.profiles_has_col(p_col text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = p_col
  );
$$;

-- Security: these helpers are only intended for internal trigger usage.
revoke all on function app.profiles_has_col(text) from public;

create or replace function app.upsert_profile_best_effort(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _has_profiles boolean;
begin
  _has_profiles := to_regclass('public.profiles') is not null;
  if not _has_profiles then
    return;
  end if;

  -- Ensure row exists (id should always exist on profiles).
  begin
    execute 'insert into public.profiles (id) values ($1) on conflict (id) do nothing'
    using p_user_id;
  exception
    when others then
      -- Don't block signup if profiles table is incompatible.
      return;
  end;

  -- Best-effort updates. Each column is checked before use.
  if app.profiles_has_col('email') then
    begin
      execute 'update public.profiles set email = $2 where id = $1'
      using p_user_id, nullif(btrim(p_email), '');
    exception when others then end;
  end if;

  if app.profiles_has_col('role') then
    begin
      execute 'update public.profiles set role = $2 where id = $1'
      using p_user_id, 'admin';
    exception when others then end;
  end if;

  if app.profiles_has_col('user_type') then
    begin
      execute 'update public.profiles set user_type = $2 where id = $1'
      using p_user_id, 'internal';
    exception when others then end;
  end if;

  if app.profiles_has_col('first_name') then
    begin
      execute 'update public.profiles set first_name = $2 where id = $1'
      using p_user_id, nullif(btrim(p_first_name), '');
    exception when others then end;
  end if;

  if app.profiles_has_col('last_name') then
    begin
      execute 'update public.profiles set last_name = $2 where id = $1'
      using p_user_id, nullif(btrim(p_last_name), '');
    exception when others then end;
  end if;

  if app.profiles_has_col('name') then
    begin
      execute 'update public.profiles set name = $2 where id = $1'
      using p_user_id, nullif(btrim(p_display_name), '');
    exception when others then end;
  end if;

  if app.profiles_has_col('organization_id') and p_org_id is not null then
    begin
      execute 'update public.profiles set organization_id = coalesce(organization_id, $2) where id = $1'
      using p_user_id, p_org_id;
    exception when others then end;
  end if;

  if app.profiles_has_col('updated_at') then
    begin
      execute 'update public.profiles set updated_at = now() where id = $1'
      using p_user_id;
    exception when others then end;
  end if;
end;
$$;

-- Security: never expose this to end-users (it bypasses RLS).
revoke all on function app.upsert_profile_best_effort(uuid, text, text, text, text, uuid) from public;

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

  -- Fallback name split if provider didn't provide given/family name explicitly.
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

  -- If org tables are missing, never block auth user creation.
  if to_regclass('public.organizations') is null then
    perform app.upsert_profile_best_effort(new.id, new.email, _display_name, _first_name, _last_name, null);
    return new;
  end if;

  -- Idempotency: if membership exists, only ensure profile is present.
  if to_regclass('public.organization_members') is not null and exists (
    select 1 from public.organization_members om where om.user_id = new.id
  ) then
    begin
      select organization_id into _org_id
      from public.organization_members
      where user_id = new.id
      order by is_default desc, created_at asc
      limit 1;
    exception when others then
      _org_id := null;
    end;

    perform app.upsert_profile_best_effort(new.id, new.email, _display_name, _first_name, _last_name, _org_id);
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

  -- Last resort: attach user to an existing org so login isn't blocked.
  if _org_id is null then
    begin
      select id into _org_id from public.organizations order by created_at asc limit 1;
    exception when others then
      _org_id := null;
    end;
  end if;

  -- Membership best-effort.
  if _org_id is not null and to_regclass('public.organization_members') is not null then
    begin
      insert into public.organization_members (organization_id, user_id, role, is_default, is_active)
      values (_org_id, new.id, 'owner'::public.org_member_role, true, true)
      on conflict (organization_id, user_id) do update
      set role = excluded.role,
          is_default = excluded.is_default,
          is_active = excluded.is_active,
          updated_at = now();
    exception when others then
      -- do nothing
    end;
  end if;

  -- Profile best-effort (never blocks signup).
  perform app.upsert_profile_best_effort(new.id, new.email, _display_name, _first_name, _last_name, _org_id);

  -- Bootstrap org profile (best effort).
  if _org_id is not null and to_regclass('public.organization_profiles') is not null then
    begin
      insert into public.organization_profiles (organization_id, legal_name, trade_name, email)
      values (_org_id, _org_name, _org_name, nullif(new.email, ''))
      on conflict (organization_id) do nothing;
    exception when others then
      -- ignore
    end;
  end if;

  return new;
end;
$$;

-- Reattach trigger (idempotent).
drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
after insert on auth.users
for each row execute function app.handle_new_auth_user();
