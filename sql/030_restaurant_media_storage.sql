-- 030_restaurant_media_storage.sql
-- Bucket + RLS for restaurant menu images.
-- Path convention: menu-images/<organization_id>/<menu_item_id>/<filename>

create schema if not exists app;

-- 1) Bucket (public read, controlled write by org membership)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'restaurant-media',
  'restaurant-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']::text[]
where not exists (
  select 1
  from storage.buckets
  where id = 'restaurant-media'
);

update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif','image/gif']::text[]
where id = 'restaurant-media';

-- 2) Policies on storage.objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'restaurant_media_public_select'
  ) THEN
    create policy restaurant_media_public_select
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'restaurant-media'
        and split_part(name, '/', 1) = 'menu-images'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'restaurant_media_member_insert'
  ) THEN
    create policy restaurant_media_member_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'restaurant-media'
        and split_part(name, '/', 1) = 'menu-images'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'restaurant_media_member_update'
  ) THEN
    create policy restaurant_media_member_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'restaurant-media'
        and split_part(name, '/', 1) = 'menu-images'
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
        bucket_id = 'restaurant-media'
        and split_part(name, '/', 1) = 'menu-images'
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
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'restaurant_media_member_delete'
  ) THEN
    create policy restaurant_media_member_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'restaurant-media'
        and split_part(name, '/', 1) = 'menu-images'
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
END
$$;
