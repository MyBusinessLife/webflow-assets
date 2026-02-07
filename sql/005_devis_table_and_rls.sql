-- 005_devis_table_and_rls.sql
-- Devis table + tenant-safe RLS policies.

create extension if not exists pgcrypto;
create schema if not exists app;

create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,
  client_name text,
  client_email text,
  client_phone text,
  client_address text,
  validity_until date,
  notes text,
  terms text,
  items jsonb not null default '[]'::jsonb,
  subtotal_cents int8 not null default 0,
  discount_cents int8 not null default 0,
  vat_cents int8 not null default 0,
  total_cents int8 not null default 0,
  currency text not null default 'EUR',
  pdf_path text,
  pdf_url text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devis add column if not exists organization_id uuid;
alter table public.devis add column if not exists reference text;
alter table public.devis add column if not exists client_name text;
alter table public.devis add column if not exists client_email text;
alter table public.devis add column if not exists client_phone text;
alter table public.devis add column if not exists client_address text;
alter table public.devis add column if not exists validity_until date;
alter table public.devis add column if not exists notes text;
alter table public.devis add column if not exists terms text;
alter table public.devis add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.devis add column if not exists subtotal_cents int8 not null default 0;
alter table public.devis add column if not exists discount_cents int8 not null default 0;
alter table public.devis add column if not exists vat_cents int8 not null default 0;
alter table public.devis add column if not exists total_cents int8 not null default 0;
alter table public.devis add column if not exists currency text not null default 'EUR';
alter table public.devis add column if not exists pdf_path text;
alter table public.devis add column if not exists pdf_url text;
alter table public.devis add column if not exists created_by uuid;
alter table public.devis add column if not exists created_at timestamptz not null default now();
alter table public.devis add column if not exists updated_at timestamptz not null default now();

-- If an old table exists without org FK, create it safely.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'devis_organization_id_fkey'
  ) THEN
    ALTER TABLE public.devis
      ADD CONSTRAINT devis_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END
$$;

create index if not exists devis_org_created_idx on public.devis (organization_id, created_at desc);
create index if not exists devis_org_reference_idx on public.devis (organization_id, reference);
create index if not exists devis_created_by_idx on public.devis (created_by, created_at desc);

-- Default organization_id / created_by from auth context.
create or replace function app.devis_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := app.current_organization_id();
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

grant execute on function app.devis_set_defaults() to authenticated, anon;

drop trigger if exists trg_devis_set_defaults on public.devis;
create trigger trg_devis_set_defaults
before insert or update on public.devis
for each row
execute function app.devis_set_defaults();

alter table public.devis enable row level security;
alter table public.devis force row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_org_select'
  ) THEN
    create policy devis_org_select
      on public.devis
      for select
      using (app.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_org_insert'
  ) THEN
    create policy devis_org_insert
      on public.devis
      for insert
      with check (
        app.is_org_member(organization_id)
        and (created_by is null or created_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_org_update'
  ) THEN
    create policy devis_org_update
      on public.devis
      for update
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_org_delete_admin'
  ) THEN
    create policy devis_org_delete_admin
      on public.devis
      for delete
      using (app.is_org_admin(organization_id));
  END IF;
END
$$;
