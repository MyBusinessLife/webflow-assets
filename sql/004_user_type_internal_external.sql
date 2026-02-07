-- 004_user_type_internal_external.sql
-- Normalize profiles.user_type to internal|external and enforce with a check constraint.

alter table if exists public.profiles
  add column if not exists user_type text;

update public.profiles
set user_type =
  case
    when lower(trim(coalesce(user_type, ''))) in (
      'external', 'externe', 'freelance', 'independant', 'independent', 'contractor', 'subcontractor', 'prestataire'
    ) then 'external'
    when lower(trim(coalesce(user_type, ''))) in (
      'internal', 'interne', 'employee', 'employe', 'salarie', 'staff', 'inhouse', 'technician', 'technicien', 'tech'
    ) then 'internal'
    when lower(trim(coalesce(role, ''))) in (
      'external', 'externe', 'freelance', 'prestataire', 'contractor', 'subcontractor'
    ) then 'external'
    else 'internal'
  end
where id is not null;

alter table if exists public.profiles
  alter column user_type set default 'internal';

alter table if exists public.profiles
  alter column user_type set not null;

do $$
begin
  if to_regclass('public.profiles') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_type_chk'
  ) then
    alter table public.profiles
      add constraint profiles_user_type_chk
      check (user_type in ('internal', 'external'));
  end if;
end
$$;

create index if not exists profiles_user_type_idx on public.profiles (user_type);
