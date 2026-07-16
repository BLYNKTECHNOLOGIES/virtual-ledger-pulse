
CREATE TABLE IF NOT EXISTS public.hr_razorpay_payslip_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NULL REFERENCES public.hr_razorpay_payroll_runs(id) ON DELETE SET NULL,
  period_month DATE NOT NULL,
  razorpay_employee_id TEXT NOT NULL,
  hr_employee_id UUID NULL REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  gross_earnings NUMERIC(14,2) NULL,
  total_deductions NUMERIC(14,2) NULL,
  net_pay NUMERIC(14,2) NULL,
  tds_amount NUMERIC(14,2) NULL,
  expected_net NUMERIC(14,2) NULL,
  variance NUMERIC(14,2) NULL,
  razorpay_payslip_id TEXT NULL,
  pdf_url TEXT NULL,
  pdf_storage_path TEXT NULL,
  source_payload JSONB NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pulled_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_month, razorpay_employee_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payslip_records_period ON public.hr_razorpay_payslip_records(period_month);
CREATE INDEX IF NOT EXISTS idx_hr_payslip_records_hr_emp ON public.hr_razorpay_payslip_records(hr_employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_payslip_records TO authenticated;
GRANT ALL ON public.hr_razorpay_payslip_records TO service_role;
ALTER TABLE public.hr_razorpay_payslip_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RazorpaySync manages payslip records"
  ON public.hr_razorpay_payslip_records
  FOR ALL
  TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR public.has_role(auth.uid(), 'Super Admin'::text))
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR public.has_role(auth.uid(), 'Super Admin'::text));

CREATE TRIGGER trg_hr_payslip_records_updated_at
  BEFORE UPDATE ON public.hr_razorpay_payslip_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.hr_razorpay_taxdoc_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  razorpay_employee_id TEXT NOT NULL,
  hr_employee_id UUID NULL REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  razorpay_document_id TEXT NULL,
  pdf_url TEXT NULL,
  pdf_storage_path TEXT NULL,
  gross_annual NUMERIC(14,2) NULL,
  total_tds NUMERIC(14,2) NULL,
  source_payload JSONB NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pulled_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, razorpay_employee_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_hr_taxdoc_records_fy ON public.hr_razorpay_taxdoc_records(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_hr_taxdoc_records_hr_emp ON public.hr_razorpay_taxdoc_records(hr_employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_taxdoc_records TO authenticated;
GRANT ALL ON public.hr_razorpay_taxdoc_records TO service_role;
ALTER TABLE public.hr_razorpay_taxdoc_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RazorpaySync manages taxdoc records"
  ON public.hr_razorpay_taxdoc_records
  FOR ALL
  TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR public.has_role(auth.uid(), 'Super Admin'::text))
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission) OR public.has_role(auth.uid(), 'Super Admin'::text));

CREATE TRIGGER trg_hr_taxdoc_records_updated_at
  BEFORE UPDATE ON public.hr_razorpay_taxdoc_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS pull_payslips_endpoint_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pull_payslips_envelope_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS pull_payslips_envelope_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pull_payslips_envelope_verified_by UUID NULL,
  ADD COLUMN IF NOT EXISTS last_payslips_pull_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pull_taxdocs_endpoint_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pull_taxdocs_envelope_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS pull_taxdocs_envelope_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pull_taxdocs_envelope_verified_by UUID NULL,
  ADD COLUMN IF NOT EXISTS last_taxdocs_pull_at TIMESTAMPTZ NULL;
