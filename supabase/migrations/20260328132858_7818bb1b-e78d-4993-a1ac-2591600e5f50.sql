-- =====================================================
-- PHASE 4 BATCH 5: All remaining tables with public/anon policies
-- =====================================================

-- BANK_BULK_FORMATS
DROP POLICY IF EXISTS "Anyone can read bank_bulk_formats" ON public.bank_bulk_formats;
CREATE POLICY "authenticated_read_bank_bulk_formats" ON public.bank_bulk_formats FOR SELECT TO authenticated USING (true);

-- CONVERSION_JOURNAL_ENTRIES (leftover old policies)
DROP POLICY IF EXISTS "Authenticated users can insert journal entries" ON public.conversion_journal_entries;
DROP POLICY IF EXISTS "Authenticated users can view journal entries" ON public.conversion_journal_entries;

-- DAILY_GROSS_PROFIT_HISTORY (leftover)
DROP POLICY IF EXISTS "Authenticated users can view gross profit history" ON public.daily_gross_profit_history;

-- DOCUMENTS (leftover)
DROP POLICY IF EXISTS "Anyone can view public documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can manage documents" ON public.documents;

-- HR leftover duplicate policies
DROP POLICY IF EXISTS "Authenticated users can manage hr_bonus_points" ON public.hr_bonus_points;
DROP POLICY IF EXISTS "Authenticated users can manage hr_candidate_ratings" ON public.hr_candidate_ratings;
DROP POLICY IF EXISTS "Authenticated users can manage hr_disciplinary_actions" ON public.hr_disciplinary_actions;
DROP POLICY IF EXISTS "Authenticated users can manage hr_employee_notes" ON public.hr_employee_notes;
DROP POLICY IF EXISTS "Authenticated users can manage hr_employee_tags" ON public.hr_employee_tags;
DROP POLICY IF EXISTS "Authenticated users can manage hr_notifications" ON public.hr_notifications;
DROP POLICY IF EXISTS "Authenticated users can manage hr_onboarding_stage_managers" ON public.hr_onboarding_stage_managers;
DROP POLICY IF EXISTS "Authenticated users can manage hr_onboarding_task_employees" ON public.hr_onboarding_task_employees;
DROP POLICY IF EXISTS "Authenticated users can manage hr_policies" ON public.hr_policies;
DROP POLICY IF EXISTS "Authenticated users can manage hr_recruitment_managers" ON public.hr_recruitment_managers;
DROP POLICY IF EXISTS "Authenticated users can manage hr_rejected_candidates" ON public.hr_rejected_candidates;
DROP POLICY IF EXISTS "Allow all for hr_salary_structure_template_items" ON public.hr_salary_structure_template_items;
DROP POLICY IF EXISTS "Allow all for hr_salary_structure_templates" ON public.hr_salary_structure_templates;
DROP POLICY IF EXISTS "Authenticated users can manage hr_skills" ON public.hr_skills;
DROP POLICY IF EXISTS "Authenticated users can manage hr_stage_managers" ON public.hr_stage_managers;
DROP POLICY IF EXISTS "Authenticated users can manage hr_stage_notes" ON public.hr_stage_notes;
DROP POLICY IF EXISTS "Authenticated users can manage hr_survey_templates" ON public.hr_survey_templates;

-- INTERVIEW_SCHEDULES
DROP POLICY IF EXISTS "Allow all operations on interview_schedules" ON public.interview_schedules;
CREATE POLICY "authenticated_all_interview_schedules" ON public.interview_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INVESTIGATION_APPROVALS
DROP POLICY IF EXISTS "Allow all operations on investigation_approvals" ON public.investigation_approvals;
CREATE POLICY "authenticated_all_investigation_approvals" ON public.investigation_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INVESTIGATION_STEPS
DROP POLICY IF EXISTS "Allow all operations on investigation_steps" ON public.investigation_steps;
DROP POLICY IF EXISTS "Allow reading investigation steps" ON public.investigation_steps;
DROP POLICY IF EXISTS "Allow updating investigation steps" ON public.investigation_steps;
CREATE POLICY "authenticated_all_investigation_steps" ON public.investigation_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INVESTIGATION_UPDATES
DROP POLICY IF EXISTS "Allow all operations on investigation_updates" ON public.investigation_updates;
DROP POLICY IF EXISTS "Allow creating investigation updates" ON public.investigation_updates;
DROP POLICY IF EXISTS "Allow reading investigation updates" ON public.investigation_updates;
DROP POLICY IF EXISTS "Allow updating investigation updates" ON public.investigation_updates;
CREATE POLICY "authenticated_all_investigation_updates" ON public.investigation_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- JOB_APPLICANTS
DROP POLICY IF EXISTS "Allow all operations" ON public.job_applicants;
CREATE POLICY "authenticated_all_job_applicants" ON public.job_applicants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- JOB_POSTINGS
DROP POLICY IF EXISTS "Allow all operations" ON public.job_postings;
CREATE POLICY "authenticated_all_job_postings" ON public.job_postings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- JOURNAL_ENTRIES (leftover)
DROP POLICY IF EXISTS "Allow all operations" ON public.journal_entries;

-- KYC_APPROVAL_REQUESTS
DROP POLICY IF EXISTS "Users can create KYC requests" ON public.kyc_approval_requests;
DROP POLICY IF EXISTS "Users can update KYC requests" ON public.kyc_approval_requests;
DROP POLICY IF EXISTS "Users can view all KYC requests" ON public.kyc_approval_requests;
CREATE POLICY "authenticated_all_kyc_approval_requests" ON public.kyc_approval_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- KYC_QUERIES
DROP POLICY IF EXISTS "Users can create KYC queries" ON public.kyc_queries;
DROP POLICY IF EXISTS "Users can update KYC queries" ON public.kyc_queries;
DROP POLICY IF EXISTS "Users can view all KYC queries" ON public.kyc_queries;
CREATE POLICY "authenticated_all_kyc_queries" ON public.kyc_queries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LEADS
DROP POLICY IF EXISTS "Allow all operations on leads" ON public.leads;
CREATE POLICY "authenticated_all_leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LEDGER_ACCOUNTS (leftover)
DROP POLICY IF EXISTS "Allow all operations" ON public.ledger_accounts;

-- LEGAL_ACTIONS
DROP POLICY IF EXISTS "Allow all operations on legal_actions" ON public.legal_actions;
CREATE POLICY "authenticated_all_legal_actions" ON public.legal_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LEGAL_COMMUNICATIONS
DROP POLICY IF EXISTS "Allow all operations on legal_communications" ON public.legal_communications;
CREATE POLICY "authenticated_all_legal_communications" ON public.legal_communications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LIEN_CASES
DROP POLICY IF EXISTS "Allow all operations on lien_cases" ON public.lien_cases;
CREATE POLICY "authenticated_all_lien_cases" ON public.lien_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LIEN_UPDATES
DROP POLICY IF EXISTS "Allow all operations on lien_updates" ON public.lien_updates;
CREATE POLICY "authenticated_all_lien_updates" ON public.lien_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- OFFER_DOCUMENTS
DROP POLICY IF EXISTS "Allow all operations on offer_documents" ON public.offer_documents;
CREATE POLICY "authenticated_all_offer_documents" ON public.offer_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);