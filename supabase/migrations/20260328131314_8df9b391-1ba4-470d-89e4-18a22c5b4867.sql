-- Temporarily make the employee creation trigger a no-op for migration
-- Save original function and replace with pass-through
CREATE OR REPLACE FUNCTION public.create_employee_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Temporarily disabled for auth migration
  -- Will be restored after migration completes
  RETURN NEW;
END;
$$;