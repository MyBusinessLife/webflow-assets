-- 001_multitenant_foundation.sql
-- Foundation multi-tenant, backward-compatible.

create extension if not exists pgcrypto;
create schema if not exists app;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  plan_code text not null default 'starter',
  billing_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_slug_uidx on public.organizations (slug);

-- One default org for bootstrap/migration.
insert into public.organizations (slug, name, plan_code)
select 'default-org', 'Default Organization', 'starter'
where not exists (select 1 from public.organizations);

-- org member role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'org_member_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'manager', 'tech', 'viewer');
  END IF;
END
$$;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.org_member_role not null default 'viewer',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists organization_members_org_id_idx on public.organization_members(organization_id);

-- Add organization_id column to existing business tables.
alter table if exists public.profiles add column if not exists organization_id uuid;
alter table if exists public.interventions add column if not exists organization_id uuid;
alter table if exists public.intervention_assignees add column if not exists organization_id uuid;
alter table if exists public.intervention_compensations add column if not exists organization_id uuid;
alter table if exists public.intervention_expenses add column if not exists organization_id uuid;
alter table if exists public.intervention_files add column if not exists organization_id uuid;
alter table if exists public.intervention_pv add column if not exists organization_id uuid;
alter table if exists public.products add column if not exists organization_id uuid;
alter table if exists public.categories add column if not exists organization_id uuid;
alter table if exists public.payouts add column if not exists organization_id uuid;
alter table if exists public.audit_logs add column if not exists organization_id uuid;
alter table if exists public.user_documents add column if not exists organization_id uuid;

-- Foreign keys (idempotent)
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_organization_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.interventions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_organization_id_fkey'
  ) THEN
    ALTER TABLE public.interventions
      ADD CONSTRAINT interventions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.intervention_assignees') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_assignees_organization_id_fkey'
  ) THEN
    ALTER TABLE public.intervention_assignees
      ADD CONSTRAINT intervention_assignees_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.intervention_compensations') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_compensations_organization_id_fkey'
  ) THEN
    ALTER TABLE public.intervention_compensations
      ADD CONSTRAINT intervention_compensations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.intervention_expenses') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_expenses_organization_id_fkey'
  ) THEN
    ALTER TABLE public.intervention_expenses
      ADD CONSTRAINT intervention_expenses_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.intervention_files') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_files_organization_id_fkey'
  ) THEN
    ALTER TABLE public.intervention_files
      ADD CONSTRAINT intervention_files_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.intervention_pv') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_pv_organization_id_fkey'
  ) THEN
    ALTER TABLE public.intervention_pv
      ADD CONSTRAINT intervention_pv_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.products') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_organization_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.categories') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_organization_id_fkey'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.payouts') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payouts_organization_id_fkey'
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_organization_id_fkey'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.user_documents') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_documents_organization_id_fkey'
  ) THEN
    ALTER TABLE public.user_documents
      ADD CONSTRAINT user_documents_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Backfill org id everywhere with first org.
DO $$
DECLARE
  _org uuid;
  _tbl text;
  _tables text[] := array[
    'profiles',
    'interventions',
    'intervention_assignees',
    'intervention_compensations',
    'intervention_expenses',
    'intervention_files',
    'intervention_pv',
    'products',
    'categories',
    'payouts',
    'audit_logs',
    'user_documents'
  ];
BEGIN
  SELECT id INTO _org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  IF _org IS NULL THEN
    RETURN;
  END IF;

  FOREACH _tbl IN ARRAY _tables LOOP
    IF to_regclass('public.' || _tbl) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET organization_id = $1 WHERE organization_id IS NULL', _tbl)
      USING _org;
    END IF;
  END LOOP;
END
$$;

-- Bootstrap members from existing profiles into first org.
DO $$
DECLARE
  _org uuid;
BEGIN
  SELECT id INTO _org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  IF _org IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_default, is_active)
  SELECT
    _org,
    p.id,
    CASE
      WHEN lower(coalesce(p.role, '')) IN ('owner') THEN 'owner'::public.org_member_role
      WHEN lower(coalesce(p.role, '')) IN ('admin') THEN 'admin'::public.org_member_role
      WHEN lower(coalesce(p.role, '')) IN ('manager') THEN 'manager'::public.org_member_role
      WHEN lower(coalesce(p.role, '')) IN ('tech', 'technicien', 'technician') THEN 'tech'::public.org_member_role
      ELSE 'viewer'::public.org_member_role
    END,
    true,
    true
  FROM public.profiles p
  WHERE p.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = _org AND om.user_id = p.id
    );
END
$$;

-- Keep profile.organization_id in sync for compatibility.
update public.profiles p
set organization_id = om.organization_id
from public.organization_members om
where om.user_id = p.id
  and om.is_default = true
  and (p.organization_id is null or p.organization_id <> om.organization_id);

-- Resolve current org from auth user.
create or replace function app.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.is_active = true
  order by om.is_default desc, om.created_at asc
  limit 1;
$$;

grant execute on function app.current_organization_id() to authenticated, anon;

-- Fill organization_id automatically on insert.
create or replace function app.fill_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_org text;
begin
  if new.organization_id is not null then
    return new;
  end if;

  jwt_org := nullif(current_setting('request.jwt.claim.organization_id', true), '');
  if jwt_org is not null then
    begin
      new.organization_id := jwt_org::uuid;
    exception when others then
      new.organization_id := null;
    end;
  end if;

  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;

  return new;
end;
$$;

grant execute on function app.fill_organization_id() to authenticated, anon;

DO $$
DECLARE
  _tbl text;
  _tables text[] := array[
    'profiles',
    'interventions',
    'intervention_assignees',
    'intervention_compensations',
    'intervention_expenses',
    'intervention_files',
    'intervention_pv',
    'products',
    'categories',
    'payouts',
    'audit_logs',
    'user_documents'
  ];
BEGIN
  FOREACH _tbl IN ARRAY _tables LOOP
    IF to_regclass('public.' || _tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_fill_organization_id ON public.%I', _tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_fill_organization_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION app.fill_organization_id()',
      _tbl
    );
  END LOOP;
END
$$;
