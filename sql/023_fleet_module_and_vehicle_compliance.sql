-- 023_fleet_module_and_vehicle_compliance.sql
-- Fleet module + compliance fields for vehicles/drivers.
--
-- Goals:
-- - Make the "vehicules / chauffeurs" part accessible to all offers except Starter.
--   We model this as a separate SaaS module: "fleet".
-- - Keep Transport (tours/courses/tarifs) gated by module "transport".
-- - Add compliance dates + maintenance basics for better transport operations.
--
-- Notes:
-- - Idempotent: safe to re-run.
-- - This migration assumes 017/018 (modules/entitlements sync) and 021 (transport tables) exist.

create schema if not exists app;

-- =========================================================
-- Plan bundles: add module "fleet"
-- =========================================================

do $$
begin
  if to_regclass('public.billing_plans') is null then
    return;
  end if;

  -- Starter: no fleet
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{fleet}', 'false'::jsonb, true),
      updated_at = now()
  where code = 'starter';

  -- All other current offers: fleet enabled
  update public.billing_plans
  set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{fleet}', 'true'::jsonb, true),
      updated_at = now()
  where code in ('growth','scale','transport','ultimate');
end
$$;

-- =========================================================
-- Compliance fields: vehicles
-- =========================================================

alter table if exists public.transport_vehicles
  add column if not exists technical_inspection_last_at date;

alter table if exists public.transport_vehicles
  add column if not exists technical_inspection_due_at date;

alter table if exists public.transport_vehicles
  add column if not exists insurance_expires_at date;

alter table if exists public.transport_vehicles
  add column if not exists odometer_km int4;

alter table if exists public.transport_vehicles
  add column if not exists next_service_due_at date;

alter table if exists public.transport_vehicles
  add column if not exists next_service_due_km int4;

create index if not exists transport_vehicles_org_ct_due_idx
  on public.transport_vehicles (organization_id, technical_inspection_due_at)
  where technical_inspection_due_at is not null;

create index if not exists transport_vehicles_org_insurance_exp_idx
  on public.transport_vehicles (organization_id, insurance_expires_at)
  where insurance_expires_at is not null;

-- =========================================================
-- Compliance fields: drivers
-- =========================================================

alter table if exists public.transport_drivers
  add column if not exists medical_visit_expires_at date;

alter table if exists public.transport_drivers
  add column if not exists fimo_expires_at date;

alter table if exists public.transport_drivers
  add column if not exists fco_expires_at date;

alter table if exists public.transport_drivers
  add column if not exists adr_expires_at date;

create index if not exists transport_drivers_org_license_expiry_idx
  on public.transport_drivers (organization_id, license_expiry)
  where license_expiry is not null;

create index if not exists transport_drivers_org_medical_exp_idx
  on public.transport_drivers (organization_id, medical_visit_expires_at)
  where medical_visit_expires_at is not null;

-- =========================================================
-- RLS: vehicles/drivers are allowed with module "fleet" OR "transport"
-- =========================================================

do $$
begin
  if to_regclass('public.transport_vehicles') is not null then
    -- Vehicles
    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_select'
    ) then
      alter policy transport_vehicles_select
        on public.transport_vehicles
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_vehicles_select
        on public.transport_vehicles
        for select
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_write'
    ) then
      alter policy transport_vehicles_write
        on public.transport_vehicles
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_vehicles_write
        on public.transport_vehicles
        for insert
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_update'
    ) then
      alter policy transport_vehicles_update
        on public.transport_vehicles
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')))
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_vehicles_update
        on public.transport_vehicles
        for update
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')))
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_vehicles' and policyname='transport_vehicles_delete_admin'
    ) then
      alter policy transport_vehicles_delete_admin
        on public.transport_vehicles
        using (app.is_org_admin(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_vehicles_delete_admin
        on public.transport_vehicles
        for delete
        using (app.is_org_admin(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;
  end if;

  if to_regclass('public.transport_drivers') is not null then
    -- Drivers
    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_select'
    ) then
      alter policy transport_drivers_select
        on public.transport_drivers
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_drivers_select
        on public.transport_drivers
        for select
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_write'
    ) then
      alter policy transport_drivers_write
        on public.transport_drivers
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_drivers_write
        on public.transport_drivers
        for insert
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_update'
    ) then
      alter policy transport_drivers_update
        on public.transport_drivers
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')))
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_drivers_update
        on public.transport_drivers
        for update
        using (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')))
        with check (app.is_org_member(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;

    if exists (
      select 1 from pg_policies where schemaname='public' and tablename='transport_drivers' and policyname='transport_drivers_delete_admin'
    ) then
      alter policy transport_drivers_delete_admin
        on public.transport_drivers
        using (app.is_org_admin(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    else
      create policy transport_drivers_delete_admin
        on public.transport_drivers
        for delete
        using (app.is_org_admin(organization_id) and (app.org_has_module(organization_id,'fleet') or app.org_has_module(organization_id,'transport')));
    end if;
  end if;
end
$$;
