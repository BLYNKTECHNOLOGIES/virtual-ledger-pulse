
-- =============================================
-- 1. LEAVE ACCRUAL PLANS (Horilla: LeaveAccrualAssign)
-- =============================================
CREATE TABLE IF NOT EXISTS public.hr_leave_accrual_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  accrual_period TEXT NOT NULL DEFAULT 'monthly' CHECK (accrual_period IN ('monthly', 'quarterly', 'yearly')),
  accrual_amount NUMERIC NOT NULL DEFAULT 1,
  max_accrual NUMERIC DEFAULT NULL, -- cap per period
  is_based_on_attendance BOOLEAN DEFAULT false, -- only accrue if employee has attendance
  min_attendance_days INTEGER DEFAULT 0, -- minimum days to qualify
  applicable_to TEXT NOT NULL DEFAULT 'all' CHECK (applicable_to IN ('all', 'department', 'position')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  position_id UUID DEFAULT NULL, -- references hr_job_positions if applicable
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  last_accrual_date DATE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hr_leave_accrual_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage accrual plans" ON public.hr_leave_accrual_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_hr_accrual_plans_leave_type ON public.hr_leave_accrual_plans(leave_type_id);
CREATE INDEX idx_hr_accrual_plans_active ON public.hr_leave_accrual_plans(is_active) WHERE is_active = true;

-- Accrual execution log to track each run
CREATE TABLE IF NOT EXISTS public.hr_leave_accrual_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accrual_plan_id UUID NOT NULL REFERENCES public.hr_leave_accrual_plans(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  accrued_days NUMERIC NOT NULL,
  accrual_date DATE NOT NULL,
  year INTEGER NOT NULL,
  quarter INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hr_leave_accrual_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage accrual log" ON public.hr_leave_accrual_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_hr_accrual_log_plan ON public.hr_leave_accrual_log(accrual_plan_id);
CREATE INDEX idx_hr_accrual_log_emp_date ON public.hr_leave_accrual_log(employee_id, accrual_date);

-- =============================================
-- 2. FILING STATUS & TAX BRACKETS (Horilla: FilingStatus, TaxBracket)
-- =============================================
CREATE TABLE IF NOT EXISTS public.hr_filing_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- e.g. "Old Regime", "New Regime", "NRI"
  based_on TEXT NOT NULL DEFAULT 'taxable_gross_pay' CHECK (based_on IN ('basic_pay', 'gross_pay', 'taxable_gross_pay')),
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hr_filing_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage filing statuses" ON public.hr_filing_statuses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.hr_tax_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_status_id UUID NOT NULL REFERENCES public.hr_filing_statuses(id) ON DELETE CASCADE,
  min_income NUMERIC NOT NULL,
  max_income NUMERIC, -- NULL means infinity (no upper limit)
  tax_rate NUMERIC NOT NULL DEFAULT 0, -- percentage e.g. 5, 10, 20, 30
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hr_tax_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage tax brackets" ON public.hr_tax_brackets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_hr_tax_brackets_filing ON public.hr_tax_brackets(filing_status_id, sort_order);

-- Add filing_status_id to hr_employees for tax regime assignment
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS filing_status_id UUID REFERENCES public.hr_filing_statuses(id) ON DELETE SET NULL;

-- Seed Indian tax regimes
INSERT INTO public.hr_filing_statuses (name, based_on, description, is_default) VALUES
  ('New Regime (FY 2024-25)', 'taxable_gross_pay', 'Default new tax regime with standard deduction of ₹75,000', true),
  ('Old Regime', 'taxable_gross_pay', 'Old regime with deductions under 80C, 80D, HRA etc.', false)
ON CONFLICT (name) DO NOTHING;

-- New Regime tax brackets (FY 2024-25)
INSERT INTO public.hr_tax_brackets (filing_status_id, min_income, max_income, tax_rate, description, sort_order)
SELECT fs.id, t.min_income, t.max_income, t.tax_rate, t.description, t.sort_order
FROM public.hr_filing_statuses fs,
(VALUES
  (0, 300000, 0, 'No tax', 1),
  (300000, 700000, 5, '5% on ₹3-7L', 2),
  (700000, 1000000, 10, '10% on ₹7-10L', 3),
  (1000000, 1200000, 15, '15% on ₹10-12L', 4),
  (1200000, 1500000, 20, '20% on ₹12-15L', 5),
  (1500000, NULL, 30, '30% above ₹15L', 6)
) AS t(min_income, max_income, tax_rate, description, sort_order)
WHERE fs.name = 'New Regime (FY 2024-25)';

-- Old Regime tax brackets
INSERT INTO public.hr_tax_brackets (filing_status_id, min_income, max_income, tax_rate, description, sort_order)
SELECT fs.id, t.min_income, t.max_income, t.tax_rate, t.description, t.sort_order
FROM public.hr_filing_statuses fs,
(VALUES
  (0, 250000, 0, 'No tax', 1),
  (250000, 500000, 5, '5% on ₹2.5-5L', 2),
  (500000, 1000000, 20, '20% on ₹5-10L', 3),
  (1000000, NULL, 30, '30% above ₹10L', 4)
) AS t(min_income, max_income, tax_rate, description, sort_order)
WHERE fs.name = 'Old Regime';

-- DB function to compute annual tax for a given taxable income + filing status
CREATE OR REPLACE FUNCTION public.compute_annual_tax(p_taxable_income NUMERIC, p_filing_status_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax NUMERIC := 0;
  v_bracket RECORD;
  v_taxable_in_bracket NUMERIC;
BEGIN
  IF p_taxable_income <= 0 OR p_filing_status_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_bracket IN
    SELECT min_income, COALESCE(max_income, 999999999999) AS max_income, tax_rate
    FROM public.hr_tax_brackets
    WHERE filing_status_id = p_filing_status_id
    ORDER BY sort_order
  LOOP
    IF p_taxable_income > v_bracket.min_income THEN
      v_taxable_in_bracket := LEAST(p_taxable_income, v_bracket.max_income) - v_bracket.min_income;
      v_tax := v_tax + (v_taxable_in_bracket * v_bracket.tax_rate / 100);
    END IF;
  END LOOP;

  RETURN ROUND(v_tax, 2);
END;
$$;

-- DB function to run leave accrual for all active plans
CREATE OR REPLACE FUNCTION public.run_leave_accrual(p_accrual_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_emp RECORD;
  v_accrued_count INTEGER := 0;
  v_year INTEGER := EXTRACT(YEAR FROM p_accrual_date);
  v_quarter INTEGER := EXTRACT(QUARTER FROM p_accrual_date);
  v_should_run BOOLEAN;
  v_existing INTEGER;
BEGIN
  FOR v_plan IN
    SELECT ap.*, lt.name AS leave_type_name
    FROM public.hr_leave_accrual_plans ap
    JOIN public.hr_leave_types lt ON lt.id = ap.leave_type_id
    WHERE ap.is_active = true AND ap.effective_from <= p_accrual_date
  LOOP
    -- Determine if this plan should run based on accrual_period
    v_should_run := false;
    IF v_plan.accrual_period = 'monthly' THEN
      -- Run if not already run this month for this plan
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id
        AND EXTRACT(YEAR FROM accrual_date) = v_year
        AND EXTRACT(MONTH FROM accrual_date) = EXTRACT(MONTH FROM p_accrual_date);
      v_should_run := (v_existing = 0);
    ELSIF v_plan.accrual_period = 'quarterly' THEN
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id AND year = v_year AND quarter = v_quarter;
      v_should_run := (v_existing = 0);
    ELSIF v_plan.accrual_period = 'yearly' THEN
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id AND year = v_year;
      v_should_run := (v_existing = 0);
    END IF;

    IF NOT v_should_run THEN CONTINUE; END IF;

    -- Get applicable employees
    FOR v_emp IN
      SELECT e.id AS employee_id
      FROM public.hr_employees e
      LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id::TEXT
      WHERE e.is_active = true
        AND (
          v_plan.applicable_to = 'all'
          OR (v_plan.applicable_to = 'department' AND wi.department_id = v_plan.department_id)
          OR (v_plan.applicable_to = 'position' AND wi.job_position_id = v_plan.position_id)
        )
    LOOP
      -- UPSERT into hr_leave_allocations: add accrual_amount to allocated_days and available_days
      INSERT INTO public.hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days)
      VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_quarter, v_plan.accrual_amount, v_plan.accrual_amount, 0)
      ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET
        allocated_days = hr_leave_allocations.allocated_days + v_plan.accrual_amount,
        available_days = hr_leave_allocations.available_days + v_plan.accrual_amount,
        updated_at = NOW();

      -- Log the accrual
      INSERT INTO public.hr_leave_accrual_log (accrual_plan_id, employee_id, accrued_days, accrual_date, year, quarter)
      VALUES (v_plan.id, v_emp.employee_id, v_plan.accrual_amount, p_accrual_date, v_year, v_quarter);

      v_accrued_count := v_accrued_count + 1;
    END LOOP;

    -- Update last accrual date on the plan
    UPDATE public.hr_leave_accrual_plans SET last_accrual_date = p_accrual_date, updated_at = NOW() WHERE id = v_plan.id;
  END LOOP;

  RETURN v_accrued_count;
END;
$$;
