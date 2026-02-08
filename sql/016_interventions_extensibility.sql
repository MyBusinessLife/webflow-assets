-- 016_interventions_extensibility.sql
-- Make interventions adaptable across verticals (BTP, trainings, services) with types + custom fields + forms.

create extension if not exists pgcrypto;
create schema if not exists app;

-- Intervention types (per org). Example: "Depannage", "Chantier", "Session formation".
create table if not exists public.intervention_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null, -- slug/key used in automation & integrations
  name text not null,
  description text,
  default_billing_mode text, -- fixed | time_and_material | milestone
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists intervention_types_org_idx
  on public.intervention_types (organization_id, is_active, name);

drop trigger if exists trg_fill_organization_id on public.intervention_types;
create trigger trg_fill_organization_id
before insert on public.intervention_types
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_intervention_types on public.intervention_types;
create trigger trg_touch_intervention_types
before update on public.intervention_types
for each row execute function app.touch_updated_at();

-- Link interventions to a type + billing mode (additive).
alter table if exists public.interventions add column if not exists intervention_type_id uuid;
alter table if exists public.interventions add column if not exists billing_mode text;

do $$
begin
  if to_regclass('public.interventions') is not null and not exists (
    select 1 from pg_constraint where conname = 'interventions_intervention_type_id_fkey'
  ) then
    alter table public.interventions
      add constraint interventions_intervention_type_id_fkey
      foreign key (intervention_type_id) references public.intervention_types(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.interventions') is not null and not exists (
    select 1 from pg_constraint where conname = 'interventions_billing_mode_chk'
  ) then
    alter table public.interventions
      add constraint interventions_billing_mode_chk
      check (billing_mode in ('fixed','time_and_material','milestone')) not valid;
  end if;
end
$$;

create index if not exists interventions_org_type_idx
  on public.interventions (organization_id, intervention_type_id, start_at desc);

-- Generic custom fields (definitions + values) to avoid migrations for each new vertical.
create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null, -- e.g. 'intervention','client','invoice','quote'
  key text not null,
  label text not null,
  field_type text not null, -- text|textarea|number|boolean|date|datetime|select|multiselect
  options jsonb not null default '{}'::jsonb, -- select options, validation, etc
  help_text text,
  sort_order int4 not null default 0,
  is_required boolean not null default false,
  is_active boolean not null default true,
  default_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, key)
);

create index if not exists custom_field_definitions_org_idx
  on public.custom_field_definitions (organization_id, entity_type, is_active, sort_order);

drop trigger if exists trg_fill_organization_id on public.custom_field_definitions;
create trigger trg_fill_organization_id
before insert on public.custom_field_definitions
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_custom_field_definitions on public.custom_field_definitions;
create trigger trg_touch_custom_field_definitions
before update on public.custom_field_definitions
for each row execute function app.touch_updated_at();

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  key text not null,
  value jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, key)
);

create index if not exists custom_field_values_org_entity_idx
  on public.custom_field_values (organization_id, entity_type, entity_id);

drop trigger if exists trg_fill_organization_id on public.custom_field_values;
create trigger trg_fill_organization_id
before insert on public.custom_field_values
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_custom_field_values on public.custom_field_values;
create trigger trg_touch_custom_field_values
before update on public.custom_field_values
for each row execute function app.touch_updated_at();

-- Form templates + submissions (PV, checklists, attendance sheets, etc).
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null, -- typically 'intervention'
  key text not null,
  name text not null,
  description text,
  schema jsonb not null default '{}'::jsonb, -- JSON schema / UI schema
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, key)
);

create index if not exists form_templates_org_idx
  on public.form_templates (organization_id, entity_type, is_active, name);

drop trigger if exists trg_fill_organization_id on public.form_templates;
create trigger trg_fill_organization_id
before insert on public.form_templates
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_form_templates on public.form_templates;
create trigger trg_touch_form_templates
before update on public.form_templates
for each row execute function app.touch_updated_at();

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.form_templates(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'draft', -- draft|submitted|signed
  data jsonb not null default '{}'::jsonb,
  signed_at timestamptz,
  signed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_submissions_org_entity_idx
  on public.form_submissions (organization_id, entity_type, entity_id, created_at desc);
create index if not exists form_submissions_org_template_idx
  on public.form_submissions (organization_id, template_id, created_at desc);

drop trigger if exists trg_fill_organization_id on public.form_submissions;
create trigger trg_fill_organization_id
before insert on public.form_submissions
for each row execute function app.fill_organization_id();

drop trigger if exists trg_touch_form_submissions on public.form_submissions;
create trigger trg_touch_form_submissions
before update on public.form_submissions
for each row execute function app.touch_updated_at();

-- RLS
alter table public.intervention_types enable row level security;
alter table public.intervention_types force row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_definitions force row level security;
alter table public.custom_field_values enable row level security;
alter table public.custom_field_values force row level security;
alter table public.form_templates enable row level security;
alter table public.form_templates force row level security;
alter table public.form_submissions enable row level security;
alter table public.form_submissions force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='intervention_types' and policyname='intervention_types_select_member'
  ) then
    create policy intervention_types_select_member
      on public.intervention_types
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='intervention_types' and policyname='intervention_types_write_admin'
  ) then
    create policy intervention_types_write_admin
      on public.intervention_types
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='custom_field_definitions' and policyname='custom_field_definitions_select_member'
  ) then
    create policy custom_field_definitions_select_member
      on public.custom_field_definitions
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='custom_field_definitions' and policyname='custom_field_definitions_write_admin'
  ) then
    create policy custom_field_definitions_write_admin
      on public.custom_field_definitions
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='custom_field_values' and policyname='custom_field_values_org_all'
  ) then
    create policy custom_field_values_org_all
      on public.custom_field_values
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='form_templates' and policyname='form_templates_select_member'
  ) then
    create policy form_templates_select_member
      on public.form_templates
      for select
      using (app.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='form_templates' and policyname='form_templates_write_admin'
  ) then
    create policy form_templates_write_admin
      on public.form_templates
      for all
      using (app.is_org_admin(organization_id))
      with check (app.is_org_admin(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='form_submissions' and policyname='form_submissions_org_all'
  ) then
    create policy form_submissions_org_all
      on public.form_submissions
      for all
      using (app.is_org_member(organization_id))
      with check (app.is_org_member(organization_id));
  end if;
end
$$;

