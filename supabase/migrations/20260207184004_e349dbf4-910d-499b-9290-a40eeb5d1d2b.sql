
-- Skills
CREATE TABLE public.hr_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_skills" ON public.hr_skills FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Recruitments
CREATE TABLE public.hr_recruitments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_event_based BOOLEAN DEFAULT false,
  closed BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  vacancy INT DEFAULT 1,
  start_date DATE,
  end_date DATE,
  skill_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_recruitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_recruitments" ON public.hr_recruitments FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Recruitment managers
CREATE TABLE public.hr_recruitment_managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recruitment_id UUID NOT NULL REFERENCES public.hr_recruitments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_recruitment_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_recruitment_managers" ON public.hr_recruitment_managers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Stages
CREATE TABLE public.hr_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recruitment_id UUID NOT NULL REFERENCES public.hr_recruitments(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_type TEXT NOT NULL DEFAULT 'initial',
  sequence INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_stages" ON public.hr_stages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Stage managers
CREATE TABLE public.hr_stage_managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.hr_stages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_stage_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_stage_managers" ON public.hr_stage_managers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Candidates
CREATE TABLE public.hr_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  profile_image_url TEXT,
  resume_url TEXT,
  portfolio_url TEXT,
  recruitment_id UUID REFERENCES public.hr_recruitments(id) ON DELETE SET NULL,
  job_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.hr_stages(id) ON DELETE SET NULL,
  gender TEXT,
  address TEXT,
  country TEXT,
  state TEXT,
  city TEXT,
  zip TEXT,
  dob DATE,
  source TEXT DEFAULT 'application',
  start_onboard BOOLEAN DEFAULT false,
  hired BOOLEAN DEFAULT false,
  canceled BOOLEAN DEFAULT false,
  converted BOOLEAN DEFAULT false,
  joining_date DATE,
  offer_letter_status TEXT DEFAULT 'not_sent',
  sequence INT DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  referral_id UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  schedule_date TIMESTAMPTZ,
  hired_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_candidates" ON public.hr_candidates FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Rejected candidates
CREATE TABLE public.hr_rejected_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  reject_reason TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_rejected_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_rejected_candidates" ON public.hr_rejected_candidates FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Stage notes
CREATE TABLE public.hr_stage_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.hr_stages(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  updated_by UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_stage_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_stage_notes" ON public.hr_stage_notes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Candidate ratings
CREATE TABLE public.hr_candidate_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  rating INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_candidate_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_candidate_ratings" ON public.hr_candidate_ratings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Survey templates
CREATE TABLE public.hr_survey_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_general_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_survey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_survey_templates" ON public.hr_survey_templates FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Onboarding stages
CREATE TABLE public.hr_onboarding_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_title TEXT NOT NULL,
  recruitment_id UUID REFERENCES public.hr_recruitments(id) ON DELETE CASCADE,
  sequence INT NOT NULL DEFAULT 0,
  is_final_stage BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_onboarding_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_onboarding_stages" ON public.hr_onboarding_stages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Onboarding stage managers
CREATE TABLE public.hr_onboarding_stage_managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.hr_onboarding_stages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_onboarding_stage_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_onboarding_stage_managers" ON public.hr_onboarding_stage_managers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Onboarding tasks
CREATE TABLE public.hr_onboarding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  stage_id UUID NOT NULL REFERENCES public.hr_onboarding_stages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_onboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_onboarding_tasks" ON public.hr_onboarding_tasks FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Onboarding task employees
CREATE TABLE public.hr_onboarding_task_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.hr_onboarding_tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_onboarding_task_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_onboarding_task_employees" ON public.hr_onboarding_task_employees FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Candidate stages (onboarding tracking)
CREATE TABLE public.hr_candidate_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  onboarding_stage_id UUID NOT NULL REFERENCES public.hr_onboarding_stages(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.hr_stages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_candidate_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_candidate_stages" ON public.hr_candidate_stages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Candidate tasks (onboarding task tracking)
CREATE TABLE public.hr_candidate_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_task_id UUID NOT NULL REFERENCES public.hr_onboarding_tasks(id) ON DELETE CASCADE,
  candidate_stage_id UUID NOT NULL REFERENCES public.hr_candidate_stages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_candidate_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_candidate_tasks" ON public.hr_candidate_tasks FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Triggers for updated_at
CREATE TRIGGER update_hr_recruitments_updated_at BEFORE UPDATE ON public.hr_recruitments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_candidates_updated_at BEFORE UPDATE ON public.hr_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_candidate_tasks_updated_at BEFORE UPDATE ON public.hr_candidate_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
