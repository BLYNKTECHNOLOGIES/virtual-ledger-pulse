-- RazorpayX component catalogue: the only names RazorpayX currently accepts
CREATE TABLE public.hr_razorpay_component_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('addition','deduction','arrear')),
  label text NOT NULL,
  tds_mode text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  source text NOT NULL DEFAULT 'dashboard_screenshot_2026-10-04',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_component_catalog TO authenticated;
GRANT ALL ON public.hr_razorpay_component_catalog TO service_role;
ALTER TABLE public.hr_razorpay_component_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR reads RazorpayX catalogue" ON public.hr_razorpay_component_catalog
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR manages RazorpayX catalogue" ON public.hr_razorpay_component_catalog
  FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE TRIGGER trg_rzp_catalog_updated BEFORE UPDATE ON public.hr_razorpay_component_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_razorpay_component_catalog (kind, label, tds_mode, sort_order) VALUES
 ('addition','Overtime','Ad hoc | Instant TDS deduction',10),
 ('addition','Ad Hoc','Ad hoc | Instant TDS deduction',11),
 ('addition','Performance Linked Incentive','Ad hoc | Instant TDS deduction',12),
 ('addition','Performance Bonus','Ad hoc | Instant TDS deduction',13),
 ('addition','Correction','Ad hoc | Instant TDS deduction',14),
 ('addition','Reimbursement','Ad hoc | Instant TDS deduction',15),
 ('addition','Recovery refund','Ad hoc | Instant TDS deduction',16),
 ('addition','F&F settlement - dues','Ad hoc | Instant TDS deduction',17),
 ('addition','Bonus','Ad hoc | Instant TDS deduction',18),
 ('addition','Employee Engagement','Ad hoc | Instant TDS deduction',19),
 ('addition','Service charges','Ad hoc | Instant TDS deduction',20),
 ('addition','loan amount deduction','Ad hoc | Instant TDS deduction',21),
 ('addition','Performance bonus','Ad hoc | Instant TDS deduction',30),
 ('addition','Performance Bonus aug','Ad hoc | Instant TDS deduction',31),
 ('addition','OVERTIME','Ad hoc | Instant TDS deduction',32),
 ('addition','Comp-off encashment 0.5 day(s)','Ad hoc | Instant TDS deduction',33),
 ('addition','Comp-off encashment 2 day(s)','Ad hoc | Instant TDS deduction',34),
 ('addition','Comp-off encashment 3 day(s)','Ad hoc | Instant TDS deduction',35),
 ('addition','Comp-off encashment 4 day(s)','Ad hoc | Instant TDS deduction',36),
 ('addition','Legal fees','Ad hoc | Instant TDS deduction',40),
 ('addition','Legal fees pay','Ad hoc | Instant TDS deduction',41),
 ('addition','Legal fees repay','Ad hoc | Instant TDS deduction',42),
 ('addition','Fees','Ad hoc | Instant TDS deduction',43),
 ('addition','Legal Fees reimburse','Ad hoc | Instant TDS deduction',44),
 ('addition','JULY','Ad hoc | Instant TDS deduction',45),
 ('addition','Correction — correction for july','Ad hoc | Instant TDS deduction',46),
 ('deduction','Advance Salary','Deduct from Gross Pay',10),
 ('deduction','Gross Pay Deduction','Deduct from Gross Pay',11),
 ('deduction','KPI Loss','Deduct from Gross Pay',12),
 ('deduction','Loan Repayment','Deduct from Gross Pay',13),
 ('deduction','Recovery','Deduct from Gross Pay',14),
 ('deduction','Security Deposit','Deduct from Gross Pay',15),
 ('deduction','Wrong Payment Recovery','Deduct from Gross Pay',16),
 ('arrear','Basic','Earning',10),
 ('arrear','Dearness Allowance','Earning',11),
 ('arrear','House Rent Allowance','Earning',12),
 ('arrear','Leave & Travel Allowance','Earning',13),
 ('arrear','Special Allowance','Earning',14);

ALTER TABLE public.hr_payroll_input_additions
  ADD COLUMN IF NOT EXISTS razorpay_label text,
  ADD COLUMN IF NOT EXISTS description text;

-- Maps an internal addition label to an approved RazorpayX name (case-exact), or NULL.
CREATE OR REPLACE FUNCTION public.hr_suggest_razorpay_label(p_label text, p_source text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE l text := coalesce(p_label,''); s text := coalesce(p_source,''); hit text;
BEGIN
  SELECT label INTO hit FROM hr_razorpay_component_catalog
   WHERE kind='addition' AND is_active AND label = btrim(l) LIMIT 1;
  IF hit IS NOT NULL THEN RETURN hit; END IF;
  IF l ~* 'comp[- ]?off' OR s ~* 'comp' THEN RETURN 'Overtime'; END IF;
  IF l ~* 'arrear|part[- ]?month|training|ctc' THEN RETURN 'Ad Hoc'; END IF;
  IF l ~* 'performance\s*linked|\mpli\M|incentive' THEN RETURN 'Performance Linked Incentive'; END IF;
  IF l ~* 'performance\s*bonus' THEN RETURN 'Performance Bonus'; END IF;
  IF l ~* 'deposit' THEN RETURN 'Recovery refund'; END IF;
  IF l ~* 'reimburs' THEN RETURN 'Reimbursement'; END IF;
  IF l ~* 'f\s*&\s*f|\mfnf\M|full\s*(and|&)\s*final|settlement' OR s ~* 'fnf' THEN RETURN 'F&F settlement - dues'; END IF;
  IF l ~* 'correction' THEN RETURN 'Correction'; END IF;
  IF l ~* 'loan|advance' THEN RETURN 'Ad Hoc'; END IF;
  IF l ~* 'overtime' THEN RETURN 'Overtime'; END IF;
  IF l ~* 'refund' THEN RETURN 'Recovery refund'; END IF;
  IF l ~* 'bonus' THEN RETURN 'Bonus'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.hr_resolve_razorpay_label()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    NEW.description := NEW.label;
  END IF;
  IF NEW.razorpay_label IS NULL AND NEW.pushed_at IS NULL THEN
    NEW.razorpay_label := public.hr_suggest_razorpay_label(NEW.label, NEW.source);
  END IF;
  IF NEW.razorpay_label IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.razorpay_label IS DISTINCT FROM OLD.razorpay_label)
     AND NOT EXISTS (SELECT 1 FROM hr_razorpay_component_catalog
                      WHERE kind='addition' AND is_active AND label = NEW.razorpay_label) THEN
    RAISE EXCEPTION '"%" is not an approved RazorpayX addition name. Pick one from the RazorpayX list (exact spelling).', NEW.razorpay_label;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolve_razorpay_label ON public.hr_payroll_input_additions;
CREATE TRIGGER trg_resolve_razorpay_label BEFORE INSERT OR UPDATE ON public.hr_payroll_input_additions
  FOR EACH ROW EXECUTE FUNCTION public.hr_resolve_razorpay_label();