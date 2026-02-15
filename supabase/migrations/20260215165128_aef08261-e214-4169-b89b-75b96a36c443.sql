
-- Skill Zone table for grouping candidates by skill categories
CREATE TABLE public.hr_skill_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Skill Zone candidates mapping
CREATE TABLE public.hr_skill_zone_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_zone_id UUID NOT NULL REFERENCES public.hr_skill_zones(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  reason TEXT,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(skill_zone_id, candidate_id)
);

-- Survey questions linked to survey templates
CREATE TABLE public.hr_survey_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.hr_survey_templates(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options JSONB,
  is_required BOOLEAN DEFAULT true,
  sequence INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Survey responses from candidates
CREATE TABLE public.hr_survey_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.hr_survey_templates(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.hr_candidates(id) ON DELETE SET NULL,
  respondent_name TEXT,
  respondent_email TEXT,
  answers JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hr_skill_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_skill_zone_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_survey_responses ENABLE ROW LEVEL SECURITY;

-- Anon policies (matching existing HRMS pattern)
CREATE POLICY "Allow all access to hr_skill_zones" ON public.hr_skill_zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_skill_zone_candidates" ON public.hr_skill_zone_candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_survey_questions" ON public.hr_survey_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_survey_responses" ON public.hr_survey_responses FOR ALL USING (true) WITH CHECK (true);
