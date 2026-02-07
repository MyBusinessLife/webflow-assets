-- 011_devis_facture_bridge.sql
-- Align devis with billing workflow and FR statuses.

create schema if not exists app;

alter table if exists public.devis add column if not exists client_id uuid;
alter table if exists public.devis add column if not exists site_id uuid;
alter table if exists public.devis add column if not exists intervention_id uuid;

alter table if exists public.devis add column if not exists contact_name text;
alter table if exists public.devis add column if not exists converted_facture_id uuid;

do $$
begin
  if to_regclass('public.devis') is null then
    return;
  end if;

  -- Foreign keys (idempotent)
  if not exists (select 1 from pg_constraint where conname = 'devis_client_id_fkey') then
    alter table public.devis
      add constraint devis_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devis_site_id_fkey') then
    alter table public.devis
      add constraint devis_site_id_fkey
      foreign key (site_id) references public.client_sites(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devis_intervention_id_fkey') then
    alter table public.devis
      add constraint devis_intervention_id_fkey
      foreign key (intervention_id) references public.interventions(id) on delete set null;
  end if;
end
$$;

create index if not exists devis_org_client_idx
  on public.devis (organization_id, client_id, created_at desc);

create index if not exists devis_converted_facture_idx
  on public.devis (converted_facture_id);

-- Extend status check to include rejected (matches UI).
do $$
begin
  if to_regclass('public.devis') is null then
    return;
  end if;

  alter table public.devis drop constraint if exists devis_status_check;

  if not exists (select 1 from pg_constraint where conname = 'devis_status_check') then
    alter table public.devis
      add constraint devis_status_check
      check (status in ('draft', 'sent', 'accepted', 'rejected', 'canceled', 'expired'));
  end if;
end
$$;

-- Best-effort backfill client_id from clients by name/email.
do $$
begin
  if to_regclass('public.devis') is null or to_regclass('public.clients') is null then
    return;
  end if;

  update public.devis d
  set client_id = c.id
  from public.clients c
  where d.organization_id = c.organization_id
    and d.client_id is null
    and (
      (nullif(trim(d.client_email), '') is not null and c.email = nullif(trim(d.client_email), ''))
      or (nullif(trim(d.client_name), '') is not null and c.name = nullif(trim(d.client_name), ''))
    );
end
$$;

