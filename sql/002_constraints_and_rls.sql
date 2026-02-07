-- 002_constraints_and_rls.sql
-- Constraints, lifecycle tracking, and RLS policies.

create schema if not exists app;

-- Core indexes for tenant performance.
create index if not exists interventions_org_idx on public.interventions (organization_id, start_at desc);
create index if not exists intervention_assignees_org_idx on public.intervention_assignees (organization_id, user_id);
create index if not exists intervention_files_org_idx on public.intervention_files (organization_id, intervention_id, created_at desc);
create index if not exists intervention_expenses_org_idx on public.intervention_expenses (organization_id, intervention_id, created_at desc);
create index if not exists intervention_compensations_org_idx on public.intervention_compensations (organization_id, intervention_id, tech_id);
create index if not exists products_org_idx on public.products (organization_id, is_active);
create index if not exists categories_org_idx on public.categories (organization_id, is_active);

-- Uniques for logical integrity.
DO $$
BEGIN
  IF to_regclass('public.intervention_assignees') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_assignees_intervention_user_key'
  ) THEN
    ALTER TABLE public.intervention_assignees
      ADD CONSTRAINT intervention_assignees_intervention_user_key
      UNIQUE (intervention_id, user_id);
  END IF;

  IF to_regclass('public.intervention_pv') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'intervention_pv_intervention_key'
  ) THEN
    ALTER TABLE public.intervention_pv
      ADD CONSTRAINT intervention_pv_intervention_key
      UNIQUE (intervention_id);
  END IF;
END
$$;

-- Big-int for money columns (future-safe).
alter table if exists public.interventions alter column tarif type int8 using tarif::int8;
alter table if exists public.intervention_expenses alter column unit_cost_cents type int8 using unit_cost_cents::int8;
alter table if exists public.intervention_expenses alter column amount_cents type int8 using amount_cents::int8;
alter table if exists public.intervention_compensations alter column amount_cents type int8 using amount_cents::int8;
alter table if exists public.products alter column price_cents type int8 using price_cents::int8;
alter table if exists public.products alter column cost_cents type int8 using cost_cents::int8;

-- Intervention lifecycle fields.
alter table if exists public.interventions add column if not exists arrived_at timestamptz;
alter table if exists public.interventions add column if not exists started_at timestamptz;
alter table if exists public.interventions add column if not exists completed_at timestamptz;
alter table if exists public.interventions add column if not exists canceled_at timestamptz;
alter table if exists public.interventions add column if not exists cancellation_reason text;
alter table if exists public.interventions add column if not exists requires_checklist bool default false;
alter table if exists public.interventions add column if not exists requires_photos bool default false;

-- Status guard for interventions only (NOT VALID for safe rollout).
DO $$
BEGIN
  IF to_regclass('public.interventions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interventions_status_allowed_check'
  ) THEN
    ALTER TABLE public.interventions
      ADD CONSTRAINT interventions_status_allowed_check
      CHECK (status IN ('planned', 'pending', 'in_progress', 'confirmed', 'done', 'canceled')) NOT VALID;
  END IF;
END
$$;

-- Status history table.
create table if not exists public.intervention_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists intervention_status_history_org_idx on public.intervention_status_history (organization_id, changed_at desc);
create index if not exists intervention_status_history_itv_idx on public.intervention_status_history (intervention_id, changed_at desc);

create or replace function app.log_intervention_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is not null then
      insert into public.intervention_status_history(
        organization_id, intervention_id, old_status, new_status, changed_by, metadata
      )
      values (
        coalesce(new.organization_id, app.current_organization_id()),
        new.id,
        null,
        new.status,
        auth.uid(),
        jsonb_build_object('source', 'insert')
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(new.status, '') <> coalesce(old.status, '') then
    insert into public.intervention_status_history(
      organization_id, intervention_id, old_status, new_status, changed_by, metadata
    )
    values (
      coalesce(new.organization_id, old.organization_id, app.current_organization_id()),
      new.id,
      old.status,
      new.status,
      auth.uid(),
      jsonb_build_object('source', 'update')
    );
  end if;

  return new;
end;
$$;

grant execute on function app.log_intervention_status_change() to authenticated, anon;

drop trigger if exists trg_log_intervention_status_change on public.interventions;
create trigger trg_log_intervention_status_change
after insert or update of status on public.interventions
for each row execute function app.log_intervention_status_change();

-- Membership helpers for RLS.
create or replace function app.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
  );
$$;

grant execute on function app.is_org_member(uuid) to authenticated, anon;

create or replace function app.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.role in ('owner', 'admin', 'manager')
  );
$$;

grant execute on function app.is_org_admin(uuid) to authenticated, anon;

-- Organizations RLS
alter table public.organizations enable row level security;
alter table public.organizations force row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_select_member'
  ) THEN
    create policy organizations_select_member
      on public.organizations
      for select
      using (app.is_org_member(id));
  END IF;
END
$$;

-- Membership RLS
alter table public.organization_members enable row level security;
alter table public.organization_members force row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members' AND policyname = 'organization_members_select'
  ) THEN
    create policy organization_members_select
      on public.organization_members
      for select
      using (
        user_id = auth.uid()
        or app.is_org_admin(organization_id)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members' AND policyname = 'organization_members_write_admin'
  ) THEN
    create policy organization_members_write_admin
      on public.organization_members
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  END IF;
END
$$;

-- Business tables RLS on organization_id.
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
    'user_documents',
    'intervention_status_history'
  ];
BEGIN
  FOREACH _tbl IN ARRAY _tables LOOP
    IF to_regclass('public.' || _tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', _tbl);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = _tbl || '_org_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (app.is_org_member(organization_id))',
        _tbl || '_org_select',
        _tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = _tbl || '_org_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (app.is_org_member(organization_id))',
        _tbl || '_org_insert',
        _tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = _tbl || '_org_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id))',
        _tbl || '_org_update',
        _tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = _tbl || '_org_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (app.is_org_member(organization_id))',
        _tbl || '_org_delete',
        _tbl
      );
    END IF;
  END LOOP;
END
$$;
