-- 004_user_type_internal_external.sql
-- Normalize profiles.user_type to internal|external and enforce with a check constraint.

alter table if exists public.profiles
  add column if not exists user_type text;

-- Drop previous user_type check constraints (legacy naming or rules).
do $$
declare
  _con record;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  for _con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%user_type%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', _con.conname);
  end loop;
end
$$;

-- Force text type for compatibility with old enum/varchar implementations.
do $$
declare
  _typ text;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into _typ
  from pg_attribute a
  join pg_class t on t.oid = a.attrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and a.attname = 'user_type'
    and a.attnum > 0
    and not a.attisdropped;

  if _typ is null then
    return;
  end if;

  if lower(_typ) <> 'text' then
    execute 'alter table public.profiles alter column user_type type text using user_type::text';
  end if;
end
$$;

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
