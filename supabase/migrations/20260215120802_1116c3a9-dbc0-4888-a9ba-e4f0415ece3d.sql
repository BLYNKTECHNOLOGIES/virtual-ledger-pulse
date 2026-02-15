-- Fix RLS for all hr_ tables to work with custom auth (anon key)
-- hr_candidates
DROP POLICY IF EXISTS "Authenticated users can manage hr_candidates" ON public.hr_candidates;
CREATE POLICY "Allow all access to hr_candidates" ON public.hr_candidates FOR ALL USING (true) WITH CHECK (true);

-- hr_stages
DROP POLICY IF EXISTS "Authenticated users can manage hr_stages" ON public.hr_stages;
CREATE POLICY "Allow all access to hr_stages" ON public.hr_stages FOR ALL USING (true) WITH CHECK (true);

-- hr_recruitments
DROP POLICY IF EXISTS "Authenticated users can manage hr_recruitments" ON public.hr_recruitments;
CREATE POLICY "Allow all access to hr_recruitments" ON public.hr_recruitments FOR ALL USING (true) WITH CHECK (true);

-- hr_candidate_stages
DROP POLICY IF EXISTS "Authenticated users can manage hr_candidate_stages" ON public.hr_candidate_stages;
CREATE POLICY "Allow all access to hr_candidate_stages" ON public.hr_candidate_stages FOR ALL USING (true) WITH CHECK (true);

-- hr_candidate_tasks
DROP POLICY IF EXISTS "Authenticated users can manage hr_candidate_tasks" ON public.hr_candidate_tasks;
CREATE POLICY "Allow all access to hr_candidate_tasks" ON public.hr_candidate_tasks FOR ALL USING (true) WITH CHECK (true);

-- hr_onboarding_stages
DROP POLICY IF EXISTS "Authenticated users can manage hr_onboarding_stages" ON public.hr_onboarding_stages;
CREATE POLICY "Allow all access to hr_onboarding_stages" ON public.hr_onboarding_stages FOR ALL USING (true) WITH CHECK (true);

-- hr_onboarding_tasks
DROP POLICY IF EXISTS "Authenticated users can manage hr_onboarding_tasks" ON public.hr_onboarding_tasks;
CREATE POLICY "Allow all access to hr_onboarding_tasks" ON public.hr_onboarding_tasks FOR ALL USING (true) WITH CHECK (true);

-- hr_employee_bank_details
DROP POLICY IF EXISTS "Authenticated users can manage hr_employee_bank_details" ON public.hr_employee_bank_details;
CREATE POLICY "Allow all access to hr_employee_bank_details" ON public.hr_employee_bank_details FOR ALL USING (true) WITH CHECK (true);