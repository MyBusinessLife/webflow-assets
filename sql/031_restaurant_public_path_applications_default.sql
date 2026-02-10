-- 031_restaurant_public_path_applications_default.sql
-- Ensure restaurant public order page path defaults to /applications/restaurant-order.
-- Keeps backward compatibility by rewriting legacy '/restaurant-order' values.

alter table if exists public.restaurant_locations
  alter column public_page_path set default '/applications/restaurant-order';

update public.restaurant_locations
set public_page_path = '/applications/restaurant-order',
    updated_at = now()
where coalesce(trim(public_page_path), '') in ('', '/restaurant-order', 'restaurant-order');

