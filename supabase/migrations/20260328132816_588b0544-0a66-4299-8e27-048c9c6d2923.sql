-- =====================================================
-- PHASE 4 BATCH 4: HR Tables (all hr_* tables)
-- =====================================================

DROP POLICY IF EXISTS "Allow all access to hr_announcements" ON public.hr_announcements;
CREATE POLICY "authenticated_all_hr_announcements" ON public.hr_announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_asset_assignments" ON public.hr_asset_assignments;
CREATE POLICY "authenticated_all_hr_asset_assignments" ON public.hr_asset_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_assets" ON public.hr_assets;
CREATE POLICY "authenticated_all_hr_assets" ON public.hr_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_attendance" ON public.hr_attendance;
CREATE POLICY "authenticated_all_hr_attendance" ON public.hr_attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_attendance_activity" ON public.hr_attendance_activity;
CREATE POLICY "authenticated_all_hr_attendance_activity" ON public.hr_attendance_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_hr_attendance_activity" ON public.hr_attendance_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow archive activity access" ON public.hr_attendance_activity_archive;
CREATE POLICY "authenticated_all_hr_attendance_activity_archive" ON public.hr_attendance_activity_archive FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_attendance_daily;
CREATE POLICY "authenticated_all_hr_attendance_daily" ON public.hr_attendance_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_hr_attendance_daily" ON public.hr_attendance_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_attendance_punches;
CREATE POLICY "authenticated_all_hr_attendance_punches" ON public.hr_attendance_punches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_hr_attendance_punches" ON public.hr_attendance_punches FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow archive punches access" ON public.hr_attendance_punches_archive;
CREATE POLICY "authenticated_all_hr_attendance_punches_archive" ON public.hr_attendance_punches_archive FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_biometric_devices" ON public.hr_biometric_devices;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_biometric_devices;
CREATE POLICY "authenticated_all_hr_biometric_devices" ON public.hr_biometric_devices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_bonus_points;
CREATE POLICY "authenticated_all_hr_bonus_points" ON public.hr_bonus_points FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_candidate_notes" ON public.hr_candidate_notes;
CREATE POLICY "authenticated_all_hr_candidate_notes" ON public.hr_candidate_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_candidate_ratings;
CREATE POLICY "authenticated_all_hr_candidate_ratings" ON public.hr_candidate_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_candidate_stages" ON public.hr_candidate_stages;
CREATE POLICY "authenticated_all_hr_candidate_stages" ON public.hr_candidate_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_candidate_tasks" ON public.hr_candidate_tasks;
CREATE POLICY "authenticated_all_hr_candidate_tasks" ON public.hr_candidate_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_candidates" ON public.hr_candidates;
CREATE POLICY "authenticated_all_hr_candidates" ON public.hr_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_deposit_transactions;
CREATE POLICY "authenticated_all_hr_deposit_transactions" ON public.hr_deposit_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_disciplinary_actions" ON public.hr_disciplinary_actions;
CREATE POLICY "authenticated_all_hr_disciplinary_actions" ON public.hr_disciplinary_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employee_bank_details" ON public.hr_employee_bank_details;
CREATE POLICY "authenticated_all_hr_employee_bank_details" ON public.hr_employee_bank_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_employee_deposits;
CREATE POLICY "authenticated_all_hr_employee_deposits" ON public.hr_employee_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employee_notes" ON public.hr_employee_notes;
CREATE POLICY "authenticated_all_hr_employee_notes" ON public.hr_employee_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employee_salary" ON public.hr_employee_salary;
CREATE POLICY "authenticated_all_hr_employee_salary" ON public.hr_employee_salary FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access for hr_employee_salary_structures" ON public.hr_employee_salary_structures;
CREATE POLICY "authenticated_all_hr_employee_salary_structures" ON public.hr_employee_salary_structures FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employee_tags" ON public.hr_employee_tags;
CREATE POLICY "authenticated_all_hr_employee_tags" ON public.hr_employee_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employee_work_info" ON public.hr_employee_work_info;
CREATE POLICY "authenticated_all_hr_employee_work_info" ON public.hr_employee_work_info FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_employees" ON public.hr_employees;
CREATE POLICY "authenticated_all_hr_employees" ON public.hr_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_feedback_360" ON public.hr_feedback_360;
CREATE POLICY "authenticated_all_hr_feedback_360" ON public.hr_feedback_360 FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_helpdesk_tickets" ON public.hr_helpdesk_tickets;
CREATE POLICY "authenticated_all_hr_helpdesk_tickets" ON public.hr_helpdesk_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_holidays" ON public.hr_holidays;
CREATE POLICY "authenticated_all_hr_holidays" ON public.hr_holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_interviews" ON public.hr_interviews;
CREATE POLICY "authenticated_all_hr_interviews" ON public.hr_interviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to leave allocation requests" ON public.hr_leave_allocation_requests;
CREATE POLICY "authenticated_all_hr_leave_allocation_requests" ON public.hr_leave_allocation_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_leave_allocations" ON public.hr_leave_allocations;
CREATE POLICY "authenticated_all_hr_leave_allocations" ON public.hr_leave_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_leave_requests" ON public.hr_leave_requests;
CREATE POLICY "authenticated_all_hr_leave_requests" ON public.hr_leave_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_leave_types" ON public.hr_leave_types;
CREATE POLICY "authenticated_all_hr_leave_types" ON public.hr_leave_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hr_notifications;
CREATE POLICY "authenticated_all_hr_notifications" ON public.hr_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_hr_notifications" ON public.hr_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_objectives" ON public.hr_objectives;
CREATE POLICY "authenticated_all_hr_objectives" ON public.hr_objectives FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_offer_letters" ON public.hr_offer_letters;
CREATE POLICY "authenticated_all_hr_offer_letters" ON public.hr_offer_letters FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_onboarding_stage_managers" ON public.hr_onboarding_stage_managers;
CREATE POLICY "authenticated_all_hr_onboarding_stage_managers" ON public.hr_onboarding_stage_managers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_onboarding_stages" ON public.hr_onboarding_stages;
CREATE POLICY "authenticated_all_hr_onboarding_stages" ON public.hr_onboarding_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_onboarding_task_employees" ON public.hr_onboarding_task_employees;
CREATE POLICY "authenticated_all_hr_onboarding_task_employees" ON public.hr_onboarding_task_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_onboarding_tasks" ON public.hr_onboarding_tasks;
CREATE POLICY "authenticated_all_hr_onboarding_tasks" ON public.hr_onboarding_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_payroll_runs" ON public.hr_payroll_runs;
CREATE POLICY "authenticated_all_hr_payroll_runs" ON public.hr_payroll_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_payslips" ON public.hr_payslips;
CREATE POLICY "authenticated_all_hr_payslips" ON public.hr_payslips FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_policies" ON public.hr_policies;
CREATE POLICY "authenticated_all_hr_policies" ON public.hr_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_recruitment_managers" ON public.hr_recruitment_managers;
CREATE POLICY "authenticated_all_hr_recruitment_managers" ON public.hr_recruitment_managers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_recruitments" ON public.hr_recruitments;
CREATE POLICY "authenticated_all_hr_recruitments" ON public.hr_recruitments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_rejected_candidates" ON public.hr_rejected_candidates;
CREATE POLICY "authenticated_all_hr_rejected_candidates" ON public.hr_rejected_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_salary_components" ON public.hr_salary_components;
CREATE POLICY "authenticated_all_hr_salary_components" ON public.hr_salary_components FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_salary_structure_template_items" ON public.hr_salary_structure_template_items;
CREATE POLICY "authenticated_all_hr_salary_structure_template_items" ON public.hr_salary_structure_template_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_salary_structure_templates" ON public.hr_salary_structure_templates;
CREATE POLICY "authenticated_all_hr_salary_structure_templates" ON public.hr_salary_structure_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_shifts" ON public.hr_shifts;
CREATE POLICY "authenticated_all_hr_shifts" ON public.hr_shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_skill_zone_candidates" ON public.hr_skill_zone_candidates;
CREATE POLICY "authenticated_all_hr_skill_zone_candidates" ON public.hr_skill_zone_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_skill_zones" ON public.hr_skill_zones;
CREATE POLICY "authenticated_all_hr_skill_zones" ON public.hr_skill_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_skills" ON public.hr_skills;
CREATE POLICY "authenticated_all_hr_skills" ON public.hr_skills FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_stage_managers" ON public.hr_stage_managers;
CREATE POLICY "authenticated_all_hr_stage_managers" ON public.hr_stage_managers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_stage_notes" ON public.hr_stage_notes;
CREATE POLICY "authenticated_all_hr_stage_notes" ON public.hr_stage_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_stages" ON public.hr_stages;
CREATE POLICY "authenticated_all_hr_stages" ON public.hr_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_survey_questions" ON public.hr_survey_questions;
CREATE POLICY "authenticated_all_hr_survey_questions" ON public.hr_survey_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_survey_responses" ON public.hr_survey_responses;
CREATE POLICY "authenticated_all_hr_survey_responses" ON public.hr_survey_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to hr_survey_templates" ON public.hr_survey_templates;
CREATE POLICY "authenticated_all_hr_survey_templates" ON public.hr_survey_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);