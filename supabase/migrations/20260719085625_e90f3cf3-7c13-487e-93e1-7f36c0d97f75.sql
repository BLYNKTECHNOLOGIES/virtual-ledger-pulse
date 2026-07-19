
ALTER TABLE public.hr_employee_salary_structures
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy_local'
    CHECK (source IN ('razorpay','razorpay_pushed','legacy_local')),
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS synced_from_razorpay_employee_id text;

COMMENT ON COLUMN public.hr_employee_salary_structures.source IS
  'Provenance: razorpay = pulled from RazorpayX; razorpay_pushed = written to RazorpayX then refetched; legacy_local = pre-doctrine row.';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='hr_employee_salary_structures'
  LOOP
    IF r.cmd IN ('INSERT','UPDATE','DELETE','ALL') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.hr_employee_salary_structures', r.policyname);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "salary_structures_read_authenticated" ON public.hr_employee_salary_structures;
CREATE POLICY "salary_structures_read_authenticated"
  ON public.hr_employee_salary_structures
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.hr_razorpay_payroll_freshness
WITH (security_invoker = true) AS
SELECT
  e.id           AS hr_employee_id,
  e.badge_id     AS badge_id,
  (COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) AS name,
  p.razorpay_employee_id,
  p.period_month,
  MAX(p.updated_at) AS last_pulled_at,
  BOOL_OR(p.reg_source_uploaded_at IS NOT NULL) AS has_register_csv,
  MAX(p.reg_source_uploaded_at) AS register_csv_uploaded_at,
  EXTRACT(EPOCH FROM (now() - MAX(p.updated_at)))/3600 AS hours_since_pull
FROM public.hr_razorpay_payslip_records p
LEFT JOIN public.hr_razorpay_employee_map m
  ON m.razorpay_employee_id = p.razorpay_employee_id
LEFT JOIN public.hr_employees e ON e.id = m.hr_employee_id
GROUP BY e.id, e.badge_id, e.first_name, e.last_name,
         p.razorpay_employee_id, p.period_month;

COMMENT ON VIEW public.hr_razorpay_payroll_freshness IS
  'Doctrine 2026-07-19: primary payroll alarm. Last RazorpayX mirror + statutory-CSV state per employee/period.';

GRANT SELECT ON public.hr_razorpay_payroll_freshness TO authenticated, service_role;
