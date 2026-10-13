ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS hiring_requirement_declined boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.hr_employee_onboarding.hiring_requirement_declined IS
  'HR explicitly chose "None — not filling a requirement"; the screen stops suggesting one.';