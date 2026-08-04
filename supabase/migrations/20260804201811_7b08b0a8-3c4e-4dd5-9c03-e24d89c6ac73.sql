CREATE TABLE public.hr_pay_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  normalized_label text NOT NULL UNIQUE,
  classification text NOT NULL DEFAULT 'unclassified',
  is_taxable boolean NOT NULL DEFAULT true,
  needs_review boolean NOT NULL DEFAULT true,
  first_seen_month date,
  last_seen_month date,
  occurrences integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_pay_heads_classification_chk CHECK (classification IN ('unclassified','regular','variable','one_time','statutory','offset','recovery'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_pay_heads TO authenticated;
GRANT ALL ON public.hr_pay_heads TO service_role;
ALTER TABLE public.hr_pay_heads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_pay_heads_authenticated_all" ON public.hr_pay_heads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.hr_payslip_pay_head_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_record_id uuid NOT NULL REFERENCES public.hr_razorpay_payslip_records(id) ON DELETE CASCADE,
  hr_employee_id uuid,
  period_month date NOT NULL,
  pay_head_id uuid REFERENCES public.hr_pay_heads(id) ON DELETE SET NULL,
  label text NOT NULL,
  normalized_label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'unclassified',
  is_taxable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payslip_record_id, normalized_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payslip_pay_head_lines TO authenticated;
GRANT ALL ON public.hr_payslip_pay_head_lines TO service_role;
ALTER TABLE public.hr_payslip_pay_head_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_payslip_pay_head_lines_authenticated_all" ON public.hr_payslip_pay_head_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_pay_head_lines_period ON public.hr_payslip_pay_head_lines(period_month);
CREATE INDEX idx_pay_head_lines_employee ON public.hr_payslip_pay_head_lines(hr_employee_id, period_month);

ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS pay_head_label text,
  ADD COLUMN IF NOT EXISTS is_taxable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS register_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS register_match_note text;

CREATE TRIGGER trg_hr_pay_heads_updated_at BEFORE UPDATE ON public.hr_pay_heads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_payslip_pay_head_lines_updated_at BEFORE UPDATE ON public.hr_payslip_pay_head_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();