-- 025_member_permissions_and_availability.sql
-- Per-member access control + availability blocks (planning)
--
-- Goals:
-- - Add a scalable per-user access layer (UI gating + future RLS tightening).
-- - Support subcontractor planning: users can block unavailable dates.
--
-- Notes:
-- - Idempotent: safe to re-run.
-- - This migration keeps existing behavior by default (permissions_mode='inherit').

create extension if not exists pgcrypto;
create schema if not exists app;

-- =========================================================
-- Extend org member roles (driver)
-- =========================================================

do $$
begin
  -- Add a new role value for drivers (chauffeurs).
  begin
    alter type public.org_member_role add value if not exists 'driver';
  exception when others then
    -- If the enum does not exist yet or cannot be altered, ignore (foundation not installed).
    null;
  end;
end
$$;

-- =========================================================
-- Per-member permissions (JSONB)
-- =========================================================

alter table if exists public.organization_members
  add column if not exists permissions_mode text not null default 'inherit';

alter table if exists public.organization_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.organization_members') is not null and not exists (
    select 1 from pg_constraint where conname = 'organization_members_permissions_mode_check'
  ) then
    alter table public.organization_members
      add constraint organization_members_permissions_mode_check
      check (permissions_mode in ('inherit','custom')) not valid;
  end if;
end
$$;

-- =========================================================
-- Availability blocks (planning)
-- =========================================================

create table if not exists public.user_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'unavailable', -- unavailable|vacation|sick|other
  reason text,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.user_availability_blocks') is not null and not exists (
    select 1 from pg_constraint where conname = 'user_availability_blocks_range_check'
  ) then
    alter table public.user_availability_blocks
      add constraint user_availability_blocks_range_check
      check (ends_at > starts_at) not valid;
  end if;

  if to_regclass('public.user_availability_blocks') is not null and not exists (
    select 1 from pg_constraint where conname = 'user_availability_blocks_kind_check'
  ) then
    alter table public.user_availability_blocks
      add constraint user_availability_blocks_kind_check
      check (kind in ('unavailable','vacation','sick','other')) not valid;
  end if;
end
$$;

create index if not exists user_availability_blocks_org_user_start_idx
  on public.user_availability_blocks (organization_id, user_id, starts_at desc);

create index if not exists user_availability_blocks_org_start_idx
  on public.user_availability_blocks (organization_id, starts_at desc);

drop trigger if exists trg_fill_organization_id on public.user_availability_blocks;
create trigger trg_fill_organization_id
before insert on public.user_availability_blocks
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_user_availability_blocks on public.user_availability_blocks;
create trigger trg_touch_user_availability_blocks
before update on public.user_availability_blocks
for each row execute function app.touch_updated_at();

-- RLS
alter table public.user_availability_blocks enable row level security;
alter table public.user_availability_blocks force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_availability_blocks' and policyname='user_availability_blocks_select'
  ) then
    create policy user_availability_blocks_select
      on public.user_availability_blocks
      for select
      using (
        app.is_org_member(organization_id)
        and (
          app.is_org_admin(organization_id)
          or user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_availability_blocks' and policyname='user_availability_blocks_write'
  ) then
    create policy user_availability_blocks_write
      on public.user_availability_blocks
      for all
      using (
        app.is_org_member(organization_id)
        and (
          app.is_org_admin(organization_id)
          or user_id = auth.uid()
        )
      )
      with check (
        app.is_org_member(organization_id)
        and (
          app.is_org_admin(organization_id)
          or user_id = auth.uid()
        )
      );
  end if;
end
$$;

-- =========================================================
-- Optional security tightening (drivers should only see their own tours)
-- =========================================================
do $$
begin
  if to_regclass('public.transport_tours') is not null then
    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_tours' and policyname='transport_tours_select'
    ) then
      alter policy transport_tours_select
        on public.transport_tours
        using (
          app.is_org_member(organization_id)
          and app.org_has_module(organization_id,'transport')
          and (
            app.is_org_admin(organization_id)
            or exists (
              select 1
              from public.transport_drivers d
              where d.id = public.transport_tours.driver_id
                and d.organization_id = public.transport_tours.organization_id
                and d.profile_id = auth.uid()
            )
          )
        );
    end if;
  end if;

  if to_regclass('public.transport_shipments') is not null then
    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_shipments' and policyname='transport_shipments_select'
    ) then
      alter policy transport_shipments_select
        on public.transport_shipments
        using (
          app.is_org_member(organization_id)
          and app.org_has_module(organization_id,'transport')
          and (
            app.is_org_admin(organization_id)
            or exists (
              select 1
              from public.transport_drivers d
              where d.id = public.transport_shipments.driver_id
                and d.organization_id = public.transport_shipments.organization_id
                and d.profile_id = auth.uid()
            )
          )
        );
    end if;
  end if;
end
$$;
