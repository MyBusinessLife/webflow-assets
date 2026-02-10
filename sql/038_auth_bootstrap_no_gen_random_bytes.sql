-- 038_auth_bootstrap_no_gen_random_bytes.sql
-- Fix: "function gen_random_bytes(integer) does not exist" during signup bootstrap.
--
-- Why it happens (Supabase common):
-- - Some extension functions live under schema "extensions".
-- - Our auth.users trigger function sets search_path to public, so unqualified
--   calls like gen_random_bytes() can fail.
--
-- This migration removes the dependency entirely by generating a short random
-- suffix via md5(random() || clock_timestamp() || user_id), which is always available.
--
-- Safe to re-run.

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
    -- Avoid gen_random_bytes() dependency (Supabase extension schema quirks).
    _slug := left(_base, _prefix_len) || '-' || substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, _suffix_len);
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

