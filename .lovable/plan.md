

# HRMS Deep Analysis — Database-to-UI Cross-Reference

## Methodology
Queried all 85 `hr_*` tables from the database and traced each one to its UI usage across all 67 HRMS page files and components.

---

## A. Tables With ZERO UI References (True Gaps)

### 1. `hr_candidate_tasks` — NO UI
- **Schema**: `id`, `candidate_task_id`, `candidate_stage_id`, `status`, `created_at`, `updated_at`
- **Purpose**: Track tasks assigned to candidates during recruitment stages (e.g., "submit portfolio", "complete assessment")
- **Gap**: No UI anywhere references this table. Candidates can move through stages but there's no task assignment/tracking per candidate per stage.
- **Fix**: Add a "Tasks" section in `CandidateProfilePage.tsx` and/or inline task checkboxes in the recruitment pipeline stage cards.

---

## B. Tables With UI But Incomplete Functionality

### 2. `hr_interviews` — Missing Scheduling UX
- Has a page (`InterviewListPage.tsx`) but needs verification of whether interview scheduling from the candidate profile or pipeline actually creates records here properly.

### 3. `hr_payroll_runs` — No Attendance Lock Integration
- Memory notes say "Attendance records within a pay period are automatically locked upon payroll finalization" but need to verify this trigger/logic actually exists.

### 4. `hr_leave_allocation_requests` — Page Exists
- `LeaveAllocationRequestsPage.tsx` exists and is routed. Covered.

---

## C. Functional Workflow Gaps (Not About Missing Tables)

### 5. F&F Auto-Creation from Resignation Flow
- `ResignationTab.tsx` has acknowledgement dialog with F&F preview BUT does NOT auto-insert into `hr_fnf_settlements`.
- The `FnFSettlementPage.tsx` has its own manual creation flow with `autoFillFnF()`.
- **Gap**: When resignation is approved and acknowledged, the system should auto-create an F&F settlement record. Currently the user must manually go to the F&F page and create one.
- **Fix**: In `ResignationTab.tsx`, when the acknowledgement dialog confirms, insert into `hr_fnf_settlements` automatically.

### 6. Resignation → Employee Deactivation
- When all checklist items are completed and F&F is settled, should the employee be auto-deactivated (`is_active: false`)? Currently this appears to be manual.

---

## D. All 85 Tables — Coverage Status

| # | Table | UI Coverage |
|---|-------|-------------|
| 1 | hr_announcements | ✅ AnnouncementsPage |
| 2 | hr_asset_assignments | ✅ AssetAssignmentsPage |
| 3 | hr_assets | ✅ AssetPage |
| 4 | hr_attendance | ✅ AttendanceOverviewPage + others |
| 5 | hr_attendance_activity | ✅ AttendanceActivityPage |
| 6 | hr_attendance_activity_archive | ⚪ Backend-only (archive) |
| 7 | hr_attendance_daily | ✅ AttendanceActivityPage + AttendanceTab |
| 8 | hr_attendance_policies | ✅ AttendancePolicyPage |
| 9 | hr_attendance_punches | ✅ AttendancePunchesPage |
| 10 | hr_attendance_punches_archive | ⚪ Backend-only (archive) |
| 11 | hr_biometric_devices | ✅ BiometricDevicesPage |
| 12 | hr_bonus_points | ✅ BonusPointsPage |
| 13 | hr_candidate_notes | ✅ CandidateProfilePage |
| 14 | hr_candidate_ratings | ✅ CandidateProfilePage |
| 15 | hr_candidate_stages | ✅ RecruitmentPipelinePage (audit trail) |
| 16 | **hr_candidate_tasks** | ❌ **NO UI — zero references** |
| 17 | hr_candidates | ✅ CandidatesListPage + Pipeline |
| 18 | hr_compoff_credits | ✅ CompOffPage |
| 19 | hr_deposit_transactions | ✅ DepositManagementPage + EmployeeProfile |
| 20 | hr_disciplinary_actions | ✅ DisciplinaryActionsPage |
| 21 | hr_email_send_log | ✅ HRLogsPage |
| 22 | hr_employee_bank_details | ✅ EmployeeProfilePage |
| 23 | hr_employee_deposits | ✅ DepositManagementPage |
| 24 | hr_employee_documents | ✅ EmployeeDocumentsPage |
| 25 | hr_employee_notes | ✅ EmployeeProfilePage |
| 26 | hr_employee_onboarding | ✅ OnboardingWizard |
| 27 | hr_employee_salary_structures | ✅ SalaryStructureAssignments |
| 28 | hr_employee_shift_schedule | ✅ ShiftScheduleManager |
| 29 | hr_employee_tags | ✅ TagsAndSkillsTab |
| 30 | hr_employee_weekly_off | ✅ WeeklyOffPage |
| 31 | hr_employee_work_info | ✅ EmployeeProfilePage + OnboardingWizard |
| 32 | hr_employees | ✅ Everywhere |
| 33 | hr_feedback_360 | ✅ Feedback360Page |
| 34 | hr_filing_statuses | ✅ TaxConfigPage |
| 35 | hr_fnf_settlements | ✅ FnFSettlementPage |
| 36 | hr_helpdesk_tickets | ✅ HelpdeskPage |
| 37 | hr_holidays | ✅ HolidaysPage |
| 38 | hr_hour_accounts | ✅ HourAccountsPage |
| 39 | hr_interviews | ✅ InterviewListPage |
| 40 | hr_late_come_early_out | ✅ LateComeEarlyOutPage |
| 41 | hr_leave_accrual_log | ✅ LeaveAccrualPlansPage |
| 42 | hr_leave_accrual_plans | ✅ LeaveAccrualPlansPage |
| 43 | hr_leave_allocation_requests | ✅ LeaveAllocationRequestsPage |
| 44 | hr_leave_allocations | ✅ LeaveAllocationsPage |
| 45 | hr_leave_requests | ✅ LeaveRequestsPage |
| 46 | hr_leave_types | ✅ LeaveTypesPage |
| 47 | hr_loan_repayments | ✅ LoansPage |
| 48 | hr_loans | ✅ LoansPage |
| 49 | hr_monthly_hours_summary | ✅ MonthlyHoursSummaryPage |
| 50 | hr_notification_log | ✅ HRLogsPage (notification tab) |
| 51 | hr_notification_preferences | ✅ HorillaHeader (filtering) |
| 52 | hr_notifications | ✅ HorillaHeader |
| 53 | hr_objectives | ✅ ObjectivesPage |
| 54 | hr_offer_letters | ✅ CandidateProfilePage + OfferDialog |
| 55 | hr_onboarding_audit_log | ✅ OnboardingWizard |
| 56 | hr_onboarding_stage_managers | ✅ OnboardingTaskManager |
| 57 | hr_onboarding_stages | ✅ OnboardingTaskManager |
| 58 | hr_onboarding_task_employees | ✅ OnboardingTaskManager |
| 59 | hr_onboarding_tasks | ✅ OnboardingTaskManager |
| 60 | hr_payroll_runs | ✅ PayrollDashboardPage |
| 61 | hr_payslips | ✅ PayslipsPage + EmployeeProfile |
| 62 | hr_penalties | ✅ PenaltyManagementPage |
| 63 | hr_penalty_rules | ✅ PenaltyAutoCalcPage |
| 64 | hr_policies | ✅ HRPoliciesPage |
| 65 | hr_recruitment_managers | ✅ RecruitmentDashboardPage |
| 66 | hr_recruitments | ✅ RecruitmentDashboardPage |
| 67 | hr_rejected_candidates | ✅ CandidateProfilePage + Pipeline |
| 68 | hr_resignation_checklist | ✅ ResignationTab |
| 69 | hr_resignation_checklist_template | ✅ ResignationTab |
| 70 | hr_salary_components | ✅ SalaryComponentsPage |
| 71 | hr_salary_revisions | ✅ SalaryRevisionsPage |
| 72 | hr_salary_structure_template_items | ✅ SalaryStructureTemplates |
| 73 | hr_salary_structure_templates | ✅ SalaryStructureTemplates |
| 74 | hr_shifts | ✅ ShiftsPage |
| 75 | hr_skill_zone_candidates | ✅ SkillZonePage |
| 76 | hr_skill_zones | ✅ SkillZonePage |
| 77 | hr_skills | ✅ TagsAndSkillsTab |
| 78 | hr_stage_managers | ✅ StagesPage |
| 79 | hr_stage_notes | ✅ CandidateProfilePage + Pipeline |
| 80 | hr_stages | ✅ StagesPage |
| 81 | hr_survey_questions | ✅ RecruitmentSurveyPage |
| 82 | hr_survey_responses | ✅ RecruitmentSurveyPage (analytics) |
| 83 | hr_survey_templates | ✅ RecruitmentSurveyPage |
| 84 | hr_tax_brackets | ✅ TaxConfigPage |
| 85 | hr_weekly_off_patterns | ✅ WeeklyOffPage + ShiftScheduleManager |

---

## Summary of Remaining Gaps

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| 1 | `hr_candidate_tasks` — no UI at all | Medium | Add task tracking per candidate per stage in CandidateProfilePage or pipeline |
| 2 | Resignation → F&F auto-creation missing | High | Auto-insert F&F settlement when resignation is acknowledged/approved |
| 3 | F&F completion → employee auto-deactivation | Medium | When F&F status = "settled", set employee `is_active = false` |

**83 of 85 tables have full UI coverage** (2 are archive tables, backend-only by design).
**1 table (`hr_candidate_tasks`) has zero UI**.
**2 workflow gaps** in the resignation→F&F→deactivation pipeline.

---

## Implementation Plan

### Step 1: Candidate Task Tracking UI
- Add a "Tasks" accordion/section in `CandidateProfilePage.tsx` that queries `hr_candidate_tasks` by `candidate_stage_id`
- Allow creating, completing, and viewing tasks per candidate per stage
- Optionally show task indicators on pipeline stage cards

### Step 2: Auto F&F Settlement on Resignation Acknowledgement
- In `ResignationTab.tsx`, when the acknowledgement is confirmed, auto-insert a record into `hr_fnf_settlements` with the calculated values already shown in the dialog
- Skip if an F&F record already exists for that employee

### Step 3: Auto Employee Deactivation on F&F Settlement
- In `FnFSettlementPage.tsx`, when status is changed to "settled", update `hr_employees` to set `is_active = false` and `status = 'inactive'`

