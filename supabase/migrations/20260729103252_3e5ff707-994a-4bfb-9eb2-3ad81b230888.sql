-- 1. Remove the duplicate draft (Stage 1, created today, no created_by).
DELETE FROM public.hr_employee_onboarding
WHERE id = '5bc4fcf5-09a6-44a8-830d-6f205dd28946'
  AND current_stage = 1
  AND created_by IS NULL;

-- 2. Prevent future duplicates: at most one open draft per email.
--   'completed' and 'cancelled' rows are excluded so historical/finished
--   onboardings never block a genuine re-hire.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employee_onboarding_one_open_per_email
  ON public.hr_employee_onboarding (lower(email))
  WHERE status NOT IN ('completed', 'cancelled') AND email IS NOT NULL;