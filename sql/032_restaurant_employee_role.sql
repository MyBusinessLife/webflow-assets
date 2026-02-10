-- 032_restaurant_employee_role.sql
-- Add a dedicated organization member role for restaurant POS employees.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'org_member_role'
  ) THEN
    ALTER TYPE public.org_member_role ADD VALUE IF NOT EXISTS 'restaurant_employee';
  END IF;
END
$$;
