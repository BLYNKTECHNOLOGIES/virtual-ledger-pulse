CREATE TABLE public.hr_onboarding_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.hr_employee_onboarding(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz,
  submitted_at timestamptz,
  emailed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hr_onboarding_invites_onboarding ON public.hr_onboarding_invites(onboarding_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_onboarding_invites TO authenticated;
GRANT ALL ON public.hr_onboarding_invites TO service_role;

ALTER TABLE public.hr_onboarding_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff manage onboarding invites"
ON public.hr_onboarding_invites FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

CREATE TRIGGER trg_hr_onboarding_invites_updated_at
BEFORE UPDATE ON public.hr_onboarding_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();