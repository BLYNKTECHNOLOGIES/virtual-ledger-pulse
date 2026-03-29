

# HRMS Deep Analysis — Remaining Gaps

After cross-referencing all 85 HR database tables against 65+ HRMS pages and components, here is a categorized list of everything still missing or broken.

---

## A. Table-to-UI Coverage (100% achieved)
All 85 `hr_*` tables now have corresponding UI integrations. The 3 excluded (2 archive tables, 1 junction table) are backend-only and need no UI. **No table coverage gaps remain.**

---

## B. Functional & Workflow Gaps (14 issues found)

### B1. Resignation Flow — Missing Acknowledgement
- **Problem**: When a resignation is completed, the employee is simply deactivated. There is no acknowledgement letter/notice generated, no email sent to the employee, and no printable summary.
- **Fix**: Add a resignation acknowledgement generation step (PDF or on-screen summary) that includes: employee name, badge, department, resignation date, last working day, checklist completion status, F&F settlement link.

### B2. Resignation Flow — No "Pending Approval" Stage
- **Problem**: Current flow goes directly from initiation to `notice_period`. There is no HR approval step before placing an employee on notice. Indrajet's case likely skipped any review.
- **Fix**: Add `pending_approval` status between initiation and `notice_period`. HR/Manager must approve before notice period begins.

### B3. Separation → F&F Linkage Missing
- **Problem**: Completing a resignation does NOT auto-create an F&F settlement record. HR must manually go to F&F page and create one — easy to miss.
- **Fix**: Auto-create a draft `hr_fnf_settlements` record when resignation status changes to `completed`.

### B4. Dashboard — Broken Navigation Links
- **Problem**: Dashboard "View All" buttons link to `/hrms/leave-requests` and `/hrms/attendance-overview` but actual routes are `/hrms/leave/requests` and `/hrms/attendance`.
- **Fix**: Correct the `navigate()` paths on dashboard action buttons.

### B5. Employee Profile — No Salary Tab Content for Non-Template Employees
- **Problem**: The Payroll tab only shows `EmployeeSalaryStructure` (overrides). If no salary template was applied during onboarding, the tab appears empty with no context — no base salary, no CTC breakdown visible.
- **Fix**: Show the employee's `total_salary` and linked salary template info alongside overrides.

### B6. Onboarding Task Manager — No Default Templates
- **Problem**: The new `OnboardingTaskManager` renders stages/tasks but starts empty. There are no default onboarding stage templates, so every onboarding requires manual stage/task creation.
- **Fix**: Seed default onboarding stages (Document Collection, IT Setup, Orientation, Training, Probation Review) via a "Load Default Template" button.

### B7. Leave Allocation — No Auto-Allocation on Employee Creation
- **Problem**: When Stage 5 finalizes and creates an employee, no leave allocations are auto-created. HR must manually go to Leave Allocations and create entries for each leave type per employee.
- **Fix**: Stage 5 finalization should auto-insert `hr_leave_allocations` rows for all active leave types with their `max_days_per_year` as the allocated balance.

### B8. Attendance — No Auto-Absent Marking
- **Problem**: Absent employees are computed client-side on the dashboard by checking who has no attendance record. There is no scheduled process to mark employees as absent if they don't clock in.
- **Fix**: Create a DB function or edge function that runs daily to insert `absent` attendance records for employees with no check-in by end of shift.

### B9. Payslip — No Individual Employee View
- **Problem**: Payslips page shows bulk payslip list from payroll runs. There is no way for an employee profile to show their own payslip history.
- **Fix**: Add a "Payslips" section to the Employee Profile Payroll tab, querying `hr_payslips` by `employee_id`.

### B10. HR Policies — Repurposed as FAQ
- **Problem**: `hr_policies` table is only used by `HelpdeskFaqPage.tsx` for FAQ entries. There is no dedicated Company Policies page for employees to view HR policies, handbooks, or compliance documents.
- **Fix**: Either split FAQs into their own table or create a separate Policies page that presents policies categorized (Leave, Attendance, Conduct, etc.).

### B11. Reports Page — Too Basic
- **Problem**: Reports page has only 4 static charts. No export functionality, no date range filters, no drill-down. Missing: attendance trend, department-wise leave analysis, payroll cost analysis, headcount trends.
- **Fix**: Add date range filters, export to Excel/PDF, and at least 4 more report types.

### B12. Employee List — No Bulk Actions
- **Problem**: Employee list has individual edit/archive/delete but no bulk selection for common operations like bulk department transfer, bulk shift assignment, or bulk status change.
- **Fix**: Add checkbox selection and a bulk actions toolbar.

### B13. Notification Preferences — Isolated from Notification System
- **Problem**: `NotificationPreferences` component saves preferences to `hr_notification_preferences`, but the actual notification creation code in `HorillaHeader.tsx` simply queries `hr_notifications` — it never checks preferences before showing/sending notifications.
- **Fix**: Notification creation logic (wherever notifications are inserted) should respect preferences. For now, at minimum, filter displayed notifications client-side by checking the user's preferences.

### B14. Survey Templates — No Response Analytics
- **Problem**: `RecruitmentSurveyPage.tsx` manages templates and questions but the response data (`hr_survey_responses`) has no analytics view — no aggregate scores, no charts, no response rate tracking.
- **Fix**: Add a "Results" tab to the survey page showing response analytics per template.

---

## C. Data Integrity Issues (3 issues)

### C1. `hr_candidate_stages` Duplicate Inserts
- **Problem**: The recent Phase 5 change inserts into `hr_candidate_stages` on every stage move in the pipeline, but uses `onboarding_stage_id` set to `newStageId` (a recruitment stage ID, not an onboarding stage ID). This is a foreign key type mismatch.
- **Fix**: Set `onboarding_stage_id` to null since this is a recruitment stage transition, not onboarding.

### C2. Onboarding Task Manager — Wrong Employee Reference
- **Problem**: `OnboardingTaskManager` uses `onboarding.candidate_id` as `employeeId` for task completion tracking. But `candidate_id` is a candidate reference, not an employee ID, so task completions won't link correctly.
- **Fix**: Use the employee ID created during Stage 5 finalization, stored in `hr_employee_onboarding.employee_id` (if that field exists) or look up the employee by candidate reference.

### C3. Leave Balance Deduction — Relies on DB Trigger
- **Problem**: Leave request approval comment says "DB trigger handles balance deduction" but this trigger may not exist. If it doesn't, approved leaves never reduce the allocation balance.
- **Fix**: Verify the trigger exists. If not, create one or handle deduction in the approval mutation.

---

## D. Recommended Implementation Priority

**Phase 1 — Critical Workflows** (B1, B2, B3, B4, C1, C2, C3):
- Fix resignation approval flow and auto-F&F creation
- Fix dashboard broken links
- Fix data integrity issues

**Phase 2 — Employee Experience** (B5, B7, B9, B10):
- Auto leave allocation on employee creation
- Payslip history in employee profile
- HR Policies page

**Phase 3 — Operational Maturity** (B6, B8, B11, B12, B13, B14):
- Default onboarding templates
- Auto-absent marking
- Enhanced reports with export
- Bulk actions
- Notification preference enforcement
- Survey analytics

---

**Total: 14 functional gaps + 3 data integrity issues = 17 items across 3 phases.**

Shall I proceed with Phase 1 (Critical Workflows)?

