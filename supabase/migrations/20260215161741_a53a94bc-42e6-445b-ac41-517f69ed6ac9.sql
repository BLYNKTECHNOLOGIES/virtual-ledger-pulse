
-- 1. Add enhanced job posting fields to hr_recruitments
ALTER TABLE public.hr_recruitments 
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id),
  ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS experience_level text DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS requirements text;

-- 2. Create hr_interviews table for interview scheduling & feedback
CREATE TABLE IF NOT EXISTS public.hr_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  recruitment_id uuid NOT NULL REFERENCES public.hr_recruitments(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.hr_stages(id) ON DELETE SET NULL,
  interviewer_name text NOT NULL,
  interview_date date NOT NULL,
  interview_time time,
  duration_minutes integer DEFAULT 30,
  interview_type text DEFAULT 'in_person',
  location text,
  meeting_link text,
  status text DEFAULT 'scheduled',
  rating integer,
  feedback text,
  strengths text,
  weaknesses text,
  recommendation text DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_interviews" ON public.hr_interviews FOR ALL USING (true) WITH CHECK (true);

-- 3. Create hr_offer_letters table
CREATE TABLE IF NOT EXISTS public.hr_offer_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  recruitment_id uuid NOT NULL REFERENCES public.hr_recruitments(id) ON DELETE CASCADE,
  offered_salary numeric NOT NULL,
  offered_position text,
  offered_department text,
  joining_date date,
  offer_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  status text DEFAULT 'draft',
  negotiation_notes text,
  rejection_reason text,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_offer_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_offer_letters" ON public.hr_offer_letters FOR ALL USING (true) WITH CHECK (true);

-- 4. Trigger for updated_at on hr_interviews
CREATE TRIGGER update_hr_interviews_updated_at
  BEFORE UPDATE ON public.hr_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger for updated_at on hr_offer_letters
CREATE TRIGGER update_hr_offer_letters_updated_at
  BEFORE UPDATE ON public.hr_offer_letters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
