
-- Salary components (Basic, HRA, DA, PF, Tax, etc.)
CREATE TABLE public.hr_salary_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  component_type VARCHAR(30) NOT NULL DEFAULT 'earning',
  is_taxable BOOLEAN DEFAULT true,
  is_fixed BOOLEAN DEFAULT true,
  calculation_type VARCHAR(20) DEFAULT 'fixed',
  percentage_of VARCHAR(50),
  default_amount NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.hr_employee_salary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.hr_salary_components(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  effective_from DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, component_id)
);

CREATE TABLE public.hr_payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_gross NUMERIC(14,2) DEFAULT 0,
  total_deductions NUMERIC(14,2) DEFAULT 0,
  total_net NUMERIC(14,2) DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  notes TEXT,
  processed_by UUID REFERENCES public.hr_employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.hr_payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  earnings_breakdown JSONB DEFAULT '{}',
  deductions_breakdown JSONB DEFAULT '{}',
  working_days INTEGER DEFAULT 0,
  present_days INTEGER DEFAULT 0,
  leave_days NUMERIC(5,1) DEFAULT 0,
  overtime_hours NUMERIC(5,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'generated',
  payment_date DATE,
  payment_reference VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);

ALTER TABLE public.hr_salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_salary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to hr_salary_components" ON public.hr_salary_components FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_employee_salary" ON public.hr_employee_salary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_payroll_runs" ON public.hr_payroll_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_payslips" ON public.hr_payslips FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_hr_salary_components_updated_at BEFORE UPDATE ON public.hr_salary_components FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_employee_salary_updated_at BEFORE UPDATE ON public.hr_employee_salary FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_payroll_runs_updated_at BEFORE UPDATE ON public.hr_payroll_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_payslips_updated_at BEFORE UPDATE ON public.hr_payslips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_salary_components (name, code, component_type, is_taxable, calculation_type, percentage_of, default_amount) VALUES
  ('Basic Salary', 'BASIC', 'earning', true, 'fixed', null, 0),
  ('House Rent Allowance', 'HRA', 'earning', true, 'percentage', 'basic', 40),
  ('Dearness Allowance', 'DA', 'earning', true, 'percentage', 'basic', 10),
  ('Conveyance Allowance', 'CA', 'earning', false, 'fixed', null, 1600),
  ('Medical Allowance', 'MA', 'earning', false, 'fixed', null, 1250),
  ('Special Allowance', 'SA', 'earning', true, 'fixed', null, 0),
  ('Provident Fund', 'PF', 'deduction', false, 'percentage', 'basic', 12),
  ('Professional Tax', 'PT', 'deduction', false, 'fixed', null, 200),
  ('Income Tax (TDS)', 'TDS', 'deduction', false, 'fixed', null, 0),
  ('ESI', 'ESI', 'deduction', false, 'percentage', 'basic', 0.75),
  ('Employer PF', 'EPF', 'employer_contrib', false, 'percentage', 'basic', 12),
  ('Employer ESI', 'EESI', 'employer_contrib', false, 'percentage', 'basic', 3.25);
