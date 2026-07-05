# HRMS Deep Logic Audit — Inventory (evidence only, zero edits)

DB reality: all hr_* empty except trace config; hr_employees=0; 35 orphaned punches. No data-loss risk → aggressive removal safe.
Scope confirmed: 65 pages src/pages/horilla (all imported+routed in App.tsx:66-129,676-745), 49 comp files, sidebar App.tsx `/hrms` block.
Note: I cannot write files in plan mode; on approval this becomes `.lovable/plan.md`.

## A. DEAD / DISCARDED CODE (zero live importers — safe deletes)
Directly dead tabs (0 importers, verified rg):
- src/components/hrms/EmployeeLifecycleTab.tsx
- src/components/hrms/PerformanceTab.tsx
- src/components/hrms/RecruitmentTab.tsx
- src/components/hrms/ShiftAttendanceTab.tsx
- src/components/hrms/candidates/CandidatesTab.tsx
Transitively dead (only imported by the dead tabs above):
- hrms/EmployeeInformationTab.tsx (only EmployeeLifecycleTab)
- hrms/EmployeeDetailsDialog.tsx (only EmployeeInformationTab)
- hrms/AddApplicantDialog.tsx, AddOfferDocumentDialog.tsx, CreateJobPostingDialog.tsx, OfferDocumentsTable.tsx, PendingInterviewsTable.tsx, ScheduleInterviewDialog.tsx (only RecruitmentTab)
- hrms/job-postings/ActiveJobPostings.tsx (recruitment cluster, 0 live)
- hrms/FeedbackSubmissionDialog.tsx, PerformanceReviewDialog.tsx (only PerformanceTab)
- hrms/OvertimeRecordDialog.tsx, ShiftManagementDialog.tsx (only ShiftAttendanceTab)
- hrms/attendance/BiometricDeviceStatus.tsx, attendance/LiveAttendanceDashboard.tsx (0 importers)
KEEP (falsely near-dead): StatisticsTab.tsx + ExpenseCategoryDrillDown.tsx → used by ERP src/pages/Statistics.tsx (not HRMS).
Unreachable route (no sidebar nav entry, deep-link only): `/hrms/recruitment/rejected` → RejectedCandidatesPage (App.tsx route present; absent from HorillaSidebar hrefs). Decide: add nav or drop.
All 65 routed pages are imported; no orphan page files.

## B. SCHEMA MISMATCHES (validated vs types.ts)
- src/components/hrms/AddOfferDocumentDialog.tsx:99,105 → `.from('sales_attachments')` — table NOT in types.ts (guaranteed runtime error). File is dead anyway → removal resolves.
- All other HRMS `.from()` tables resolve against types.ts (checked full set).
- All 7 HRMS RPCs exist in types.ts Functions: apply_salary_template, auto_generate_penalties, compute_annual_tax, fn_generate_payroll, fn_initialize_resignation_checklist, refresh_hour_accounts, run_leave_accrual → OK.
- Column-level insert audit: spot-checked AddEmployeeDialog (badge_id/first/last only) OK; full per-insert required-column pass deferred to H2 with data empty (low risk).

## C. BROKEN WIRING
- Punch→attendance disconnect: hr_attendance_punches only READ (AttendancePunchesPage). No code rolls punches into hr_attendance/hr_attendance_daily. BiometricReportUploader.tsx inserts hr_attendance directly from uploaded report, bypassing device punches → 35 orphaned punches never surface in daily/summary.
- hr_attendance_daily / hr_monthly_hours_summary: only READ (AttendanceActivityPage, MonthlyHoursSummaryPage, profile/AttendanceTab). Population depends on refresh_hour_accounts RPC (called from HourAccountsPage/PayrollDashboard) — verify trigger/RPC actually fills daily; otherwise summary always empty.
- No TODO/FIXME/mock/stub handlers found in HRMS (rg clean); no empty onClick.
- navigate() targets all resolve to real routes (checked against App.tsx).

## D. WORKFLOW TRACES
1. Employee create→profile→documents: AddEmployeeDialog→hr_employees(+work_info) WORKS; EmployeeProfilePage reads employees/work_info/notes/shifts/positions/departments WORKS; EmployeeDocumentsPage→hr_employee_documents WORKS.
2. Attendance punch→daily→summary→late/OT: BROKEN — punches ingested but never rolled to hr_attendance/daily (C above); daily/summary read-only, depend on unverified RPC/trigger; late/OT computed only on manual hr_attendance rows.
3. Leave request→approval→deduction: WORKS — LeaveRequestsPage:107-146 validates balance, updates status; deduction via DB trigger (used_days). Verify trigger exists (empty DB untested).
4. Payroll structure→run→payslip: structure (SalaryStructure/Templates, apply_salary_template) WORKS; run via fn_generate_payroll (PayrollDashboardPage) WORKS; PayslipsPage→hr_payslips read WORKS — assuming fn populates payslips.
5. Recruitment recruitment→candidate→stage→interview→offer: pages wired (RecruitmentDashboard/Pipeline/Candidates/Interviews/Stages, InterviewDialog→hr_interviews, OfferDialog→hr_offer_letters) WORKS; legacy duplicate flow in dead RecruitmentTab (job_postings/job_applicants/offer_documents) is discarded parallel implementation.
6. Onboarding stages→tasks→completion: OnboardingWizard→hr_employee_onboarding, TaskManager→hr_onboarding_tasks/task_employees/stages WORKS.
7. PMS objectives/feedback: ObjectivesPage→hr_objectives, Feedback360Page→hr_feedback_360 WORKS; MPIPage WORKS.
8. Assets + Helpdesk: AssetPage→hr_assets, AssetAssignments→hr_asset_assignments, HelpdeskPage→hr_helpdesk_tickets WORKS.

## E. FIX PLAN (severity-ranked, 3 batches)
### H1 — Dead-code removal (safe deletes, no logic risk)
Delete the 19 files in section A dead set (5 tabs + transitive deps + 2 attendance components). Removing them auto-resolves the sales_attachments mismatch. No route/nav edits needed (none reference them). Verify with tsgo after.

### H2 — Mechanical fixes (no product decisions)
- Resolve `/hrms/recruitment/rejected` nav gap: add HorillaSidebar link OR drop route (recommend add link, page is functional).
- Full column-level required-field insert pass across live HRMS insert forms (schema-diff vs types.ts) — mechanical, low volume.
- Verify refresh_hour_accounts RPC/trigger actually writes hr_attendance_daily + hr_monthly_hours_summary; wire the "refresh" button if missing on those read-only pages.

### H3 — Incomplete workflows
- Attendance punch→daily rollup (Workflow 2): PRODUCT DECISION: complete vs remove. Either (a) build punch→hr_attendance aggregation job (mechanical if pairing rules defined) or (b) drop biometric-device path and standardize on BiometricReportUploader manual import. Recommend: keep manual report import as source of truth, demote raw punches page to diagnostic-only (module never went live, device integration unproven).
- Leave/payroll DB-trigger dependencies (Workflows 3,4): mechanical verification — confirm triggers/functions exist and populate on empty DB via a smoke test before go-live.
- Recruitment duplicate implementation: mechanical — deleting dead RecruitmentTab cluster (H1) leaves the routed page-based flow as the single source.
