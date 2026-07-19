
ALTER TABLE public.hr_salary_components
  ADD COLUMN IF NOT EXISTS razorpay_key TEXT;

UPDATE public.hr_salary_components SET razorpay_key = 'basic'        WHERE code = 'BASIC' AND razorpay_key IS NULL;
UPDATE public.hr_salary_components SET razorpay_key = 'hra'          WHERE code = 'HRA'   AND razorpay_key IS NULL;
UPDATE public.hr_salary_components SET razorpay_key = 'employer-pf'  WHERE code = 'PFC'   AND razorpay_key IS NULL;
UPDATE public.hr_salary_components SET razorpay_key = 'employer-esi' WHERE code = 'ESIC'  AND razorpay_key IS NULL;

INSERT INTO public.hr_salary_components (name, code, component_type, is_taxable, is_fixed, calculation_type, default_amount, is_active, razorpay_key)
SELECT * FROM (VALUES
  ('Dearness Allowance', 'DA',                'earning', true,  false, 'flat', 0::numeric, true, 'da'),
  ('Special Allowance',  'SPECIAL_ALLOWANCE', 'earning', true,  false, 'flat', 0::numeric, true, 'special-allowance'),
  ('LTA',                'LTA',               'earning', false, false, 'flat', 0::numeric, true, 'lta')
) AS v(name, code, component_type, is_taxable, is_fixed, calculation_type, default_amount, is_active, razorpay_key)
WHERE NOT EXISTS (SELECT 1 FROM public.hr_salary_components c WHERE c.code = v.code);

ALTER TABLE public.hr_salary_structure_template_items
  ADD COLUMN IF NOT EXISTS is_residual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS razorpay_taxable TEXT
    CHECK (razorpay_taxable IS NULL OR razorpay_taxable IN ('yes','no','flexi'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_template_items_one_residual
  ON public.hr_salary_structure_template_items (template_id)
  WHERE is_residual = true;

CREATE TABLE IF NOT EXISTS public.hr_employee_salary_structure_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  razorpay_employee_id BIGINT,
  template_id UUID REFERENCES public.hr_salary_structure_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  annual_ctc NUMERIC NOT NULL,
  expanded_breakdown JSONB NOT NULL,
  razorpay_ack JSONB,
  razorpay_status_code INTEGER,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_by UUID,
  push_status TEXT NOT NULL DEFAULT 'success'
    CHECK (push_status IN ('success','failed','dry_run')),
  push_error TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_ess_assign_employee ON public.hr_employee_salary_structure_assignments (employee_id, pushed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_ess_assign_template ON public.hr_employee_salary_structure_assignments (template_id);

GRANT SELECT, INSERT ON public.hr_employee_salary_structure_assignments TO authenticated;
GRANT ALL ON public.hr_employee_salary_structure_assignments TO service_role;

ALTER TABLE public.hr_employee_salary_structure_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_admin_read_ess_assignments"
  ON public.hr_employee_salary_structure_assignments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "employee_read_own_ess_assignments"
  ON public.hr_employee_salary_structure_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hr_employees e
      WHERE e.id = hr_employee_salary_structure_assignments.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "hr_admin_insert_ess_assignments"
  ON public.hr_employee_salary_structure_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );
