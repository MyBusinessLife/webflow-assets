-- 043_documents_storage_unification.sql
-- Document engine foundation (files):
-- - Add pdf_bucket columns so each row knows where its PDF is stored.
-- - Create a single unified bucket "documents-files" (optional) + RLS policies.
--
-- Recommended path for unified bucket:
--   documents/<organization_id>/<doc_type>/<entity_id>/<filename>.pdf
-- Examples:
--   documents/<org>/devis/<devis_id>/DV-2026-0001.pdf
--   documents/<org>/factures/<facture_id>/FA-2026-0004.pdf
--
-- Notes:
-- - Keep existing buckets ("devis-files", "factures-files") for backward compatibility.
-- - Frontend can opt-in by setting data-bucket="documents-files" on the Webflow root element.

create schema if not exists app;

-- =========================================================
-- pdf_bucket columns (backward compatible)
-- =========================================================
alter table if exists public.devis add column if not exists pdf_bucket text;
alter table if exists public.factures add column if not exists pdf_bucket text;

do $$
begin
  if to_regclass('public.devis') is not null then
    update public.devis
    set pdf_bucket = coalesce(nullif(trim(pdf_bucket), ''), 'devis-files')
    where coalesce(nullif(trim(pdf_bucket), ''), '') = '';

    begin
      alter table public.devis alter column pdf_bucket set default 'devis-files';
    exception when others then
      -- ignore
    end;
  end if;

  if to_regclass('public.factures') is not null then
    update public.factures
    set pdf_bucket = coalesce(nullif(trim(pdf_bucket), ''), 'factures-files')
    where coalesce(nullif(trim(pdf_bucket), ''), '') = '';

    begin
      alter table public.factures alter column pdf_bucket set default 'factures-files';
    exception when others then
      -- ignore
    end;
  end if;
end
$$;

-- =========================================================
-- Unified storage bucket (optional)
-- =========================================================
do $$
begin
  -- Create the bucket if it does not exist yet.
  -- (Safe in Supabase SQL editor as postgres.)
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('documents-files', 'documents-files', false)
    on conflict (id) do nothing;
  end if;
end
$$;

-- =========================================================
-- Storage RLS policies for documents-files
-- =========================================================
-- Rule: any authenticated org member can read/write inside:
--   documents/<org_uuid>/...
-- Delete is admin-only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_files_storage_member_select'
  ) THEN
    create policy documents_files_storage_member_select
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'documents-files'
        and split_part(name, '/', 1) = 'documents'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.is_active = true
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_files_storage_member_insert'
  ) THEN
    create policy documents_files_storage_member_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'documents-files'
        and split_part(name, '/', 1) = 'documents'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.is_active = true
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_files_storage_member_update'
  ) THEN
    create policy documents_files_storage_member_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'documents-files'
        and split_part(name, '/', 1) = 'documents'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.is_active = true
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      )
      with check (
        bucket_id = 'documents-files'
        and split_part(name, '/', 1) = 'documents'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.is_active = true
            and om.organization_id = split_part(name, '/', 2)::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_files_storage_admin_delete'
  ) THEN
    create policy documents_files_storage_admin_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'documents-files'
        and split_part(name, '/', 1) = 'documents'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
	        and exists (
	          select 1
	          from public.organization_members om
	          where om.user_id = auth.uid()
	            and om.is_active = true
	            and om.organization_id = split_part(name, '/', 2)::uuid
	            and lower(coalesce(om.role::text, '')) in ('owner','admin','manager')
	        )
	      );
	  END IF;
END
$$;
