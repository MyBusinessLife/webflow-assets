-- 027_org_profile_branding.sql
-- Branding / UI customization fields on organization profile.

alter table public.organization_profiles
  add column if not exists brand_logo_url text,
  add column if not exists theme_primary text,
  add column if not exists theme_secondary text,
  add column if not exists theme_surface text,
  add column if not exists theme_text text,
  add column if not exists theme_nav_bg text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_brand_logo_url_http_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_brand_logo_url_http_chk
      check (brand_logo_url is null or brand_logo_url ~* '^https?://');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_theme_primary_hex_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_theme_primary_hex_chk
      check (theme_primary is null or theme_primary ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_theme_secondary_hex_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_theme_secondary_hex_chk
      check (theme_secondary is null or theme_secondary ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_theme_surface_hex_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_theme_surface_hex_chk
      check (theme_surface is null or theme_surface ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_theme_text_hex_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_theme_text_hex_chk
      check (theme_text is null or theme_text ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_profiles_theme_nav_bg_hex_chk'
      and conrelid = 'public.organization_profiles'::regclass
  ) then
    alter table public.organization_profiles
      add constraint organization_profiles_theme_nav_bg_hex_chk
      check (theme_nav_bg is null or theme_nav_bg ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;
end
$$;
