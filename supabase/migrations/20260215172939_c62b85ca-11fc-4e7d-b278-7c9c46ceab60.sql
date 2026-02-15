-- Employee salary structure: maps salary components to individual employees
CREATE TABLE public.hr_employee_salary_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.hr_salary_components(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, component_id)
);

-- Enable RLS with anon policy (matching HRMS convention)
ALTER TABLE public.hr_employee_salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for hr_employee_salary_structures" ON public.hr_employee_salary_structures FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_hr_employee_salary_structures_updated_at
  BEFORE UPDATE ON public.hr_employee_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
