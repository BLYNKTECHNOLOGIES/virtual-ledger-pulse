
-- Create performance review tables
CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_period TEXT NOT NULL,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  final_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED')),
  employee_comments TEXT,
  supervisor_comments TEXT,
  hrd_comments TEXT,
  supervisor_name TEXT,
  supervisor_signature TEXT,
  hrd_name TEXT,
  hrd_signature TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create performance review criteria table
CREATE TABLE IF NOT EXISTS public.performance_review_criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  criteria TEXT NOT NULL,
  score INTEGER CHECK (score >= 1 AND score <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create offboarding table
CREATE TABLE IF NOT EXISTS public.employee_offboarding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  initiated_by TEXT,
  reason_for_leaving TEXT,
  last_working_day DATE,
  notice_period_days INTEGER,
  handover_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (handover_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  exit_interview_completed BOOLEAN DEFAULT false,
  assets_returned BOOLEAN DEFAULT false,
  final_settlement_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'IN_PROGRESS', 'COMPLETED')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee_id ON public.performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_review_criteria_review_id ON public.performance_review_criteria(review_id);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_employee_id ON public.employee_offboarding(employee_id);
CREATE INDEX IF NOT EXISTS idx_interview_schedules_applicant_id ON public.interview_schedules(applicant_id);
CREATE INDEX IF NOT EXISTS idx_offer_documents_applicant_id ON public.offer_documents(applicant_id);

-- Update employees table to include auto-generated employee ID logic
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS department_code TEXT GENERATED ALWAYS AS (
  CASE 
    WHEN department = 'Technology' THEN 'TECH'
    WHEN department = 'Sales' THEN 'SALE'
    WHEN department = 'Marketing' THEN 'MKTG'
    WHEN department = 'HR' THEN 'HR'
    WHEN department = 'Finance' THEN 'FIN'
    ELSE 'GEN'
  END
) STORED;

-- Function to generate employee ID
CREATE OR REPLACE FUNCTION generate_employee_id(dept TEXT, designation TEXT)
RETURNS TEXT AS $$
DECLARE
  dept_code TEXT;
  desig_code TEXT;
  counter INTEGER;
  new_id TEXT;
BEGIN
  -- Get department code
  dept_code := CASE 
    WHEN dept = 'Technology' THEN 'TECH'
    WHEN dept = 'Sales' THEN 'SALE'
    WHEN dept = 'Marketing' THEN 'MKTG'
    WHEN dept = 'HR' THEN 'HR'
    WHEN dept = 'Finance' THEN 'FIN'
    ELSE 'GEN'
  END;
  
  -- Get designation code (first 3 characters)
  desig_code := UPPER(LEFT(designation, 3));
  
  -- Get next counter for this combination
  SELECT COALESCE(MAX(CAST(RIGHT(employee_id, 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM employees 
  WHERE employee_id LIKE dept_code || desig_code || '%';
  
  -- Generate new ID
  new_id := dept_code || desig_code || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;
