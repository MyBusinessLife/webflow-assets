-- 006_devis_status_and_storage_rls.sql
-- Quote status lifecycle + storage RLS for PDF uploads.

create schema if not exists app;

alter table if exists public.devis
  add column if not exists status text;

update public.devis
set status = case
  when coalesce(pdf_url, '') <> '' or coalesce(pdf_path, '') <> '' then 'sent'
  else 'draft'
end
where status is null;

alter table if exists public.devis
  alter column status set default 'draft';

DO $$
BEGIN
  IF to_regclass('public.devis') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'devis_status_check'
     ) THEN
    ALTER TABLE public.devis
      ADD CONSTRAINT devis_status_check
      CHECK (status IN ('draft', 'sent', 'accepted', 'canceled', 'expired'));
  END IF;
END
$$;

create index if not exists devis_org_status_idx on public.devis (organization_id, status, created_at desc);

-- Storage rules for devis PDFs in interventions-files bucket.
-- Expected path: devis/<organization_id>/<quote_id>/<filename>.pdf
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_select_member'
  ) THEN
    create policy devis_storage_select_member
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app.is_org_member(split_part(name, '/', 2)::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_insert_member'
  ) THEN
    create policy devis_storage_insert_member
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app.is_org_member(split_part(name, '/', 2)::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_update_member'
  ) THEN
    create policy devis_storage_update_member
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app.is_org_member(split_part(name, '/', 2)::uuid)
      )
      with check (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app.is_org_member(split_part(name, '/', 2)::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_delete_admin'
  ) THEN
    create policy devis_storage_delete_admin
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app.is_org_admin(split_part(name, '/', 2)::uuid)
      );
  END IF;
END
$$;
