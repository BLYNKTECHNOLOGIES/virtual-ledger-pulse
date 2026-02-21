
-- Salary structure templates (named templates like "Under 15,000")
CREATE TABLE public.hr_salary_structure_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items within each template (each links to an hr_salary_component)
CREATE TABLE public.hr_salary_structure_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.hr_salary_structure_templates(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.hr_salary_components(id) ON DELETE CASCADE,
  calculation_type TEXT NOT NULL DEFAULT 'percentage' CHECK (calculation_type IN ('fixed', 'percentage')),
  value NUMERIC NOT NULL DEFAULT 0,
  percentage_of TEXT DEFAULT 'total_salary' CHECK (percentage_of IN ('total_salary', 'basic_pay')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, component_id)
);

-- Add total_salary and salary_structure_template_id to hr_employees
ALTER TABLE public.hr_employees 
  ADD COLUMN IF NOT EXISTS total_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_structure_template_id UUID REFERENCES public.hr_salary_structure_templates(id);

-- Enable RLS
ALTER TABLE public.hr_salary_structure_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_structure_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for hr_salary_structure_templates" ON public.hr_salary_structure_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hr_salary_structure_template_items" ON public.hr_salary_structure_template_items FOR ALL USING (true) WITH CHECK (true);
