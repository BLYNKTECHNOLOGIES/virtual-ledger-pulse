
-- Objectives / Key Results for PMS
CREATE TABLE public.hr_objectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  objective_type TEXT NOT NULL DEFAULT 'individual', -- individual, team, company
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, completed, cancelled
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  progress INTEGER NOT NULL DEFAULT 0, -- 0-100
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES public.hr_employees(id),
  review_cycle TEXT, -- Q1-2026, H1-2026, FY-2026
  key_results JSONB DEFAULT '[]'::jsonb, -- array of {title, target, current, unit}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_objectives" ON public.hr_objectives FOR ALL USING (true) WITH CHECK (true);

-- 360° Feedback
CREATE TABLE public.hr_feedback_360 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.hr_employees(id),
  review_cycle TEXT NOT NULL, -- Q1-2026 etc
  feedback_type TEXT NOT NULL DEFAULT 'peer', -- self, peer, manager, subordinate
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  strengths TEXT,
  improvements TEXT,
  comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, submitted, reviewed
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_feedback_360 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_feedback_360" ON public.hr_feedback_360 FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_hr_objectives_employee ON public.hr_objectives(employee_id);
CREATE INDEX idx_hr_objectives_status ON public.hr_objectives(status);
CREATE INDEX idx_hr_feedback_employee ON public.hr_feedback_360(employee_id);
CREATE INDEX idx_hr_feedback_cycle ON public.hr_feedback_360(review_cycle);
