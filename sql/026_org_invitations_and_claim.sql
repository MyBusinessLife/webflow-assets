-- 026_org_invitations_and_claim.sql
-- Invitations employes/sous-traitants + rattachement automatique a l'organisation.
--
-- Objectifs:
-- - Permettre aux admins d'inviter des comptes via email.
-- - Autoriser un utilisateur deja existant a "reclamer" ses invitations.
-- - Eviter la creation d'une org personnelle quand un nouvel utilisateur est invite.

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Invitations table
-- =========================================================

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_member_role not null default 'viewer',
  user_type text not null default 'internal',
  permissions_mode text not null default 'inherit',
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- pending|accepted|revoked|expired
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.organization_invitations') is not null and not exists (
    select 1 from pg_constraint where conname = 'organization_invitations_user_type_check'
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_user_type_check
      check (user_type in ('internal','external')) not valid;
  end if;

  if to_regclass('public.organization_invitations') is not null and not exists (
    select 1 from pg_constraint where conname = 'organization_invitations_permissions_mode_check'
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_permissions_mode_check
      check (permissions_mode in ('inherit','custom')) not valid;
  end if;

  if to_regclass('public.organization_invitations') is not null and not exists (
    select 1 from pg_constraint where conname = 'organization_invitations_status_check'
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_status_check
      check (status in ('pending','accepted','revoked','expired')) not valid;
  end if;

  if to_regclass('public.organization_invitations') is not null and not exists (
    select 1 from pg_constraint where conname = 'organization_invitations_expiry_check'
  ) then
    alter table public.organization_invitations
      add constraint organization_invitations_expiry_check
      check (expires_at is null or expires_at > invited_at) not valid;
  end if;
end
$$;

create index if not exists organization_invitations_org_status_idx
  on public.organization_invitations (organization_id, status, invited_at desc);

create index if not exists organization_invitations_email_status_idx
  on public.organization_invitations ((lower(email)), status);

create unique index if not exists organization_invitations_org_email_pending_uidx
  on public.organization_invitations (organization_id, (lower(email)))
  where status = 'pending';

drop trigger if exists trg_touch_organization_invitations on public.organization_invitations;
create trigger trg_touch_organization_invitations
before update on public.organization_invitations
for each row execute function app.touch_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_invitations' and policyname='organization_invitations_select'
  ) then
    create policy organization_invitations_select
      on public.organization_invitations
      for select
      using (
        app.is_org_admin(organization_id)
        or (
          status = 'pending'
          and lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_invitations' and policyname='organization_invitations_write_admin'
  ) then
    create policy organization_invitations_write_admin
      on public.organization_invitations
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;
end
$$;

-- =========================================================
-- Claim helper (existing users can claim pending invites)
-- =========================================================

create or replace function app.claim_pending_org_invitations()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _invite record;
  _accepted integer := 0;
  _is_default boolean;
  _profile_role text;
begin
  if _uid is null then
    return 0;
  end if;

  begin
    _email := lower(nullif(coalesce((auth.jwt() ->> 'email'), ''), ''));
  exception when others then
    _email := null;
  end;

  if _email is null then
    begin
      select lower(nullif(u.email, ''))
      into _email
      from auth.users u
      where u.id = _uid
      limit 1;
    exception when others then
      _email := null;
    end;
  end if;

  if _email is null then
    return 0;
  end if;

  update public.organization_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at is not null
    and expires_at <= now();

  for _invite in
    select i.*
    from public.organization_invitations i
    where i.status = 'pending'
      and lower(i.email) = _email
      and (i.expires_at is null or i.expires_at > now())
    order by i.invited_at asc, i.created_at asc
  loop
    select not exists (
      select 1
      from public.organization_members om
      where om.user_id = _uid
    )
    into _is_default;

    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      is_default,
      is_active,
      permissions_mode,
      permissions
    )
    values (
      _invite.organization_id,
      _uid,
      _invite.role,
      _is_default,
      true,
      coalesce(nullif(_invite.permissions_mode, ''), 'inherit'),
      coalesce(_invite.permissions, '{}'::jsonb)
    )
    on conflict (organization_id, user_id) do update
    set role = excluded.role,
        is_active = true,
        permissions_mode = excluded.permissions_mode,
        permissions = excluded.permissions,
        updated_at = now();

    _profile_role := case
      when _invite.role in ('owner','admin','manager') then 'admin'
      when _invite.role = 'tech' then 'tech'
      when _invite.role = 'driver' then 'driver'
      else 'viewer'
    end;

    update public.profiles p
    set organization_id = coalesce(p.organization_id, _invite.organization_id),
        role = case
          when coalesce(nullif(p.role, ''), '') = '' then _profile_role
          else p.role
        end,
        user_type = case
          when coalesce(nullif(p.user_type, ''), '') = '' then
            case when lower(coalesce(_invite.user_type, '')) = 'external' then 'external' else 'internal' end
          else p.user_type
        end,
        updated_at = now()
    where p.id = _uid;

    update public.organization_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = _uid,
        updated_at = now()
    where id = _invite.id;

    _accepted := _accepted + 1;
  end loop;

  return _accepted;
end;
$$;

grant execute on function app.claim_pending_org_invitations() to authenticated, anon;

-- =========================================================
-- Auth bootstrap update:
-- prefer pending invite org over creating a new personal org
-- =========================================================

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
  _invite record;
  _has_invite boolean := false;
  _member_role public.org_member_role;
  _permissions_mode text := 'inherit';
  _permissions jsonb := '{}'::jsonb;
  _inv_user_type text := 'internal';
  _profile_role text;
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

  if coalesce(_first_name, '') = '' and coalesce(_last_name, '') = '' and coalesce(_full_name, '') <> '' then
    _first_name := split_part(_full_name, ' ', 1);
    _last_name := nullif(btrim(replace(_full_name, _first_name, '')), '');
  end if;

  -- Idempotency: if a membership already exists, just make sure profile exists.
  if exists (select 1 from public.organization_members om where om.user_id = new.id) then
    select om.organization_id, om.role
    into _org_id, _member_role
    from public.organization_members om
    where om.user_id = new.id
      and om.is_active = true
    order by om.is_default desc, om.created_at asc
    limit 1;

    _profile_role := case
      when _member_role in ('owner','admin','manager') then 'admin'
      when _member_role = 'tech' then 'tech'
      when _member_role = 'driver' then 'driver'
      else 'viewer'
    end;

    insert into public.profiles (
      id, email, role, user_type, first_name, last_name, name, organization_id, created_at, updated_at
    )
    values (
      new.id,
      new.email,
      coalesce(_profile_role, 'admin'),
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
  end if;

  -- Try to bind invited users to the inviter org instead of creating a personal org.
  if _email <> '' and to_regclass('public.organization_invitations') is not null then
    update public.organization_invitations
    set status = 'expired',
        updated_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at <= now();

    select i.*
    into _invite
    from public.organization_invitations i
    where i.status = 'pending'
      and lower(i.email) = lower(_email)
      and (i.expires_at is null or i.expires_at > now())
    order by i.invited_at asc, i.created_at asc
    limit 1;

    if found then
      _has_invite := true;
      _org_id := _invite.organization_id;
      _member_role := coalesce(_invite.role, 'viewer'::public.org_member_role);
      _permissions_mode := case when lower(coalesce(_invite.permissions_mode, '')) = 'custom' then 'custom' else 'inherit' end;
      _permissions := coalesce(_invite.permissions, '{}'::jsonb);
      _inv_user_type := case when lower(coalesce(_invite.user_type, '')) = 'external' then 'external' else 'internal' end;
    end if;
  end if;

  -- No invite found: fallback to personal org bootstrap.
  if _org_id is null then
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

    _member_role := 'owner'::public.org_member_role;
    _permissions_mode := 'inherit';
    _permissions := '{}'::jsonb;
    _inv_user_type := 'internal';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    is_default,
    is_active,
    permissions_mode,
    permissions
  )
  values (
    _org_id,
    new.id,
    coalesce(_member_role, 'owner'::public.org_member_role),
    true,
    true,
    _permissions_mode,
    _permissions
  )
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      is_default = excluded.is_default,
      is_active = excluded.is_active,
      permissions_mode = excluded.permissions_mode,
      permissions = excluded.permissions,
      updated_at = now();

  if _has_invite then
    update public.organization_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = new.id,
        updated_at = now()
    where id = _invite.id;
  end if;

  _profile_role := case
    when _member_role in ('owner','admin','manager') then 'admin'
    when _member_role = 'tech' then 'tech'
    when _member_role = 'driver' then 'driver'
    else 'viewer'
  end;

  insert into public.profiles (
    id,
    email,
    role,
    user_type,
    first_name,
    last_name,
    name,
    organization_id,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(_profile_role, 'admin'),
    _inv_user_type,
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
      role = coalesce(nullif(public.profiles.role, ''), excluded.role),
      user_type = coalesce(nullif(public.profiles.user_type, ''), excluded.user_type),
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
after insert on auth.users
for each row execute function app.handle_new_auth_user();
