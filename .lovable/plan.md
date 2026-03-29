

# HRMS Remaining Gaps — Updated Status

## Phase 1 (Critical Workflows) — DONE ✓
- B1 Resignation acknowledgement — implemented (auto-calculated F&F shown in dialog)
- B2 Pending approval stage — implemented
- B3 Auto F&F creation — implemented with calculated values
- B4 Dashboard broken links — fixed
- C1 `onboarding_stage_id` FK mismatch — fixed (set to null)
- C2 OnboardingTaskManager employee reference — fixed (prefers `employee_id`)
- C3 Leave balance trigger — verified exists

## Phase 2 (Employee Experience) — NOT STARTED

### B5. Employee Profile Payroll Tab — Partially done
- Payslip history (B9) is implemented ✓
- Missing: `total_salary` display + linked salary template name when no overrides exist. The Payroll tab shows payslip table + `EmployeeSalaryStructure` overrides but nothing about the employee's base CTC or which template was applied.
- **Fix**: Add a salary summary card at the top of the Payroll tab showing CTC, salary template name (from `hr_salary_templates` via `hr_employee_salary_structures`), and breakdown.

### B7. Auto Leave Allocation on Employee Creation — NOT DONE
- Stage 5 finalization creates the employee but does NOT insert any `hr_leave_allocations`.
- **Fix**: After employee creation in `OnboardingWizard.tsx` (after line ~168), query all active `hr_leave_types`, insert allocations with `max_days_per_year` as `allocated_days` and `available_days`.

### B10. HR Policies Page — NOT DONE
- `hr_policies` table is only used by FAQ page. No separate Policies page exists.
- **Fix**: Create `HRPoliciesPage.tsx` with categorized policy view (Leave, Attendance, Conduct, etc.), add route + sidebar link.

## Phase 3 (Operational Maturity) — NOT STARTED

### B6. Onboarding Default Templates — NOT DONE
- `OnboardingTaskManager` starts empty with no stages/tasks.
- **Fix**: Add "Load Default Template" button that seeds 5 standard stages with tasks.

### B8. Auto-Absent Marking — NOT DONE
- Only a UI toggle exists in AttendancePolicyPage (`absent_if_no_punch`). No actual edge function or cron job runs.
- **Fix**: Create an edge function + cron that marks employees absent daily if no punch recorded.

### B11. Reports Page — Too Basic
- Only 4 static charts, no filters, no export.
- **Fix**: Add date range filters, export to CSV/PDF, and 4+ additional report types (attendance trends, department leave, payroll costs, headcount).

### B12. Employee List Bulk Actions — NOT DONE
- No checkbox selection or bulk operations.
- **Fix**: Add checkbox column, bulk actions toolbar (department transfer, shift assign, status change).

### B13. Notification Preferences Not Enforced — NOT DONE
- `NotificationPreferences` saves to DB but `HorillaHeader.tsx` never reads preferences to filter.
- **Fix**: In HorillaHeader, query `hr_notification_preferences` and filter displayed notifications client-side.

### B14. Survey Response Analytics — NOT DONE
- No analytics view for `hr_survey_responses`.
- **Fix**: Add "Results" tab to `RecruitmentSurveyPage` with aggregate charts.

---

## Implementation Plan — Phase 2

I'll implement the 3 Phase 2 items:

### Step 1: Auto Leave Allocation on Employee Creation
- In `OnboardingWizard.tsx`, after employee insert (line ~168), query `hr_leave_types` where `is_active = true`, then bulk insert into `hr_leave_allocations` with current year/quarter, `allocated_days = max_days_per_year`, `available_days = max_days_per_year`.

### Step 2: Salary Summary in Employee Profile Payroll Tab
- In `EmployeeProfilePage.tsx`, add a salary summary card above the payslip table showing: total_salary (CTC), salary template name (join through `hr_employee_salary_structures` → `hr_salary_templates`), and monthly breakdown.

### Step 3: HR Policies Page
- Create `src/pages/horilla/HRPoliciesPage.tsx` — categorized view of `hr_policies` with category filter tabs.
- Add route in `App.tsx` and sidebar link in `HorillaSidebar.tsx` under a "Company" or "Helpdesk" section.

Phase 3 (B6, B8, B11-B14) will follow after Phase 2 approval.

