-- 1. Deterministic current-employee resolution (prefer active, then newest)
CREATE OR REPLACE FUNCTION public.hr_current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.hr_employees
  WHERE user_id = auth.uid()
  ORDER BY is_active DESC NULLS LAST, created_at DESC
  LIMIT 1;
$$;

-- 2. Unlink the stale inactive duplicate row (audit data preserved)
UPDATE public.hr_employees
SET user_id = NULL
WHERE id = 'efbfba92-3341-440d-a878-856f4cb94fab'
  AND is_active = false;

-- 3. Prevent a login from being linked to two ACTIVE employee records
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_unique_active_user
  ON public.hr_employees (user_id)
  WHERE user_id IS NOT NULL AND is_active = true;