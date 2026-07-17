ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS offer_policy_documents jsonb DEFAULT '{}'::jsonb;