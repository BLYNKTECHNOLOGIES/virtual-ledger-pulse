
-- SET NULL on config tables that reference employees
UPDATE hr_stages SET manager_id = NULL WHERE manager_id IS NOT NULL;
UPDATE hr_candidates SET referral_id = NULL WHERE referral_id IS NOT NULL;
UPDATE hr_assets SET assigned_to = NULL WHERE assigned_to IS NOT NULL;
UPDATE hr_employee_onboarding SET reporting_manager_id = NULL WHERE reporting_manager_id IS NOT NULL;

-- Delete employee-specific child data
DELETE FROM hr_penalties;
DELETE FROM hr_disciplinary_actions;
DELETE FROM hr_feedback_360;
DELETE FROM hr_objectives;
DELETE FROM hr_helpdesk_tickets;
DELETE FROM hr_asset_assignments;
DELETE FROM hr_employee_salary_structures;
DELETE FROM hr_attendance_activity;
DELETE FROM hr_attendance_activity_archive;
DELETE FROM hr_attendance_punches;
DELETE FROM hr_attendance_punches_archive;
DELETE FROM hr_attendance_daily;
DELETE FROM hr_attendance;
DELETE FROM hr_hour_accounts;
DELETE FROM hr_late_come_early_out;
DELETE FROM hr_leave_accrual_log;
DELETE FROM hr_leave_requests;
DELETE FROM hr_leave_allocation_requests;
DELETE FROM hr_leave_allocations;
DELETE FROM hr_compoff_credits;
DELETE FROM hr_loan_repayments;
DELETE FROM hr_loans;
DELETE FROM hr_deposit_transactions;
DELETE FROM hr_employee_deposits;
DELETE FROM hr_payslips;
DELETE FROM hr_payroll_runs;
DELETE FROM hr_salary_revisions;
DELETE FROM hr_fnf_settlements;
DELETE FROM hr_resignation_checklist;
DELETE FROM hr_employee_documents;
DELETE FROM hr_employee_notes;
DELETE FROM hr_employee_bank_details;
DELETE FROM hr_employee_shift_schedule;
DELETE FROM hr_employee_weekly_off;
DELETE FROM hr_employee_tags;
DELETE FROM hr_notifications;
DELETE FROM hr_notification_preferences;
DELETE FROM hr_notification_log;
DELETE FROM hr_filing_statuses;
DELETE FROM hr_recruitment_managers;
DELETE FROM hr_stage_managers;
DELETE FROM hr_onboarding_stage_managers;
DELETE FROM hr_onboarding_task_employees;
DELETE FROM hr_candidate_ratings;
DELETE FROM hr_stage_notes;
DELETE FROM hr_employee_work_info;
DELETE FROM hr_employee_onboarding;

-- Finally delete all employees
DELETE FROM hr_employees;
