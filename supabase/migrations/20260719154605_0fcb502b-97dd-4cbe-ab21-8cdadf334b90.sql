ALTER TABLE public.hr_employee_onboarding
ADD COLUMN IF NOT EXISTS bank_details jsonb;