-- 008_devis_storage_bucket_devis_files.sql
-- Storage RLS policies for quote PDFs in the devis-files bucket.
-- Path: devis/<organization_id>/<quote_id>/<filename>.pdf

create schema if not exists app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_files_storage_member_select'
  ) THEN
    create policy devis_files_storage_member_select
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'devis-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_files_storage_member_insert'
  ) THEN
    create policy devis_files_storage_member_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'devis-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_files_storage_member_update'
  ) THEN
    create policy devis_files_storage_member_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'devis-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      )
      with check (
        bucket_id = 'devis-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_files_storage_member_delete'
  ) THEN
    create policy devis_files_storage_member_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'devis-files'
        and split_part(name, '/', 1) = 'devis'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;
END
$$;
