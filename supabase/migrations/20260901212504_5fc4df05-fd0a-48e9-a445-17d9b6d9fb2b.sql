
CREATE TABLE IF NOT EXISTS public.hr_accrual_test_runs (
  id uuid primary key default gen_random_uuid(),
  report text,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.hr_accrual_test_runs TO service_role;
ALTER TABLE public.hr_accrual_test_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "hr staff read accrual test runs" ON public.hr_accrual_test_runs
    FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE EXECUTE ON FUNCTION public.hr_test_accrual_dryrun() FROM anon, authenticated;
