-- 007_devis_rls_hardening.sql
-- Hardening RLS for quotes and quote PDFs.

create schema if not exists app;

alter table if exists public.devis enable row level security;
alter table if exists public.devis force row level security;

DO $$
BEGIN
  IF to_regclass('public.devis') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_member_select_v2'
    ) THEN
      create policy devis_member_select_v2
        on public.devis
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.organization_members om
            where om.organization_id = devis.organization_id
              and om.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_member_insert_v2'
    ) THEN
      create policy devis_member_insert_v2
        on public.devis
        for insert
        to authenticated
        with check (
          organization_id is not null
          and exists (
            select 1
            from public.organization_members om
            where om.organization_id = devis.organization_id
              and om.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_member_update_v2'
    ) THEN
      create policy devis_member_update_v2
        on public.devis
        for update
        to authenticated
        using (
          exists (
            select 1
            from public.organization_members om
            where om.organization_id = devis.organization_id
              and om.user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.organization_members om
            where om.organization_id = devis.organization_id
              and om.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'devis' AND policyname = 'devis_member_delete_v2'
    ) THEN
      create policy devis_member_delete_v2
        on public.devis
        for delete
        to authenticated
        using (
          exists (
            select 1
            from public.organization_members om
            where om.organization_id = devis.organization_id
              and om.user_id = auth.uid()
          )
        );
    END IF;
  END IF;
END
$$;

-- Storage access for quote PDFs under: devis/<organization_id>/<quote_id>/<filename>.pdf
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_member_select_v2'
  ) THEN
    create policy devis_storage_member_select_v2
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = (
              case
                when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then split_part(name, '/', 2)::uuid
                else null
              end
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_member_insert_v2'
  ) THEN
    create policy devis_storage_member_insert_v2
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = (
              case
                when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then split_part(name, '/', 2)::uuid
                else null
              end
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_member_update_v2'
  ) THEN
    create policy devis_storage_member_update_v2
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = (
              case
                when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then split_part(name, '/', 2)::uuid
                else null
              end
            )
        )
      )
      with check (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = (
              case
                when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then split_part(name, '/', 2)::uuid
                else null
              end
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'devis_storage_member_delete_v2'
  ) THEN
    create policy devis_storage_member_delete_v2
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'interventions-files'
        and split_part(name, '/', 1) = 'devis'
        and exists (
          select 1
          from public.organization_members om
          where om.user_id = auth.uid()
            and om.organization_id = (
              case
                when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then split_part(name, '/', 2)::uuid
                else null
              end
            )
        )
      );
  END IF;
END
$$;
