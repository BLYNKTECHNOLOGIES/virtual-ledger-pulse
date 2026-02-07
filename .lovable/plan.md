

# Horilla HRMS -- Complete Clone Implementation Plan

## Overview

This plan recreates every Horilla HRMS module as a self-contained React application within your existing dashboard. Clicking "HRMS" in the sidebar navigates to `/hrms`, which renders a completely separate Horilla-themed interface with its own sidebar, dashboard, notifications, charts, reports, and PDF generation. Your existing dashboard (Sales, Purchase, BAMS, Clients, etc.) remains 100% untouched.

---

## What Gets Removed (Final Phase Only)

- **Pages**: `HRMS.tsx`, `EMS.tsx`, `Payroll.tsx`
- **Component folders**: `src/components/hrms/*`, `src/components/ems/*`, `src/components/payroll/*`
- **Sidebar entries**: "HR Management" group (HRMS, Payroll, EMS) replaced with single "HRMS" link
- **Routes**: `/ems`, `/payroll` removed; `/hrms` re-pointed to new shell
- **Database tables** (dropped after new system is live): `employees`, `payslips`, `employee_offboarding`, `job_applicants`, `job_postings`, `performance_reviews`, `performance_review_criteria`, `interview_schedules`, `offer_documents`
- **Tables KEPT** (shared): `departments`, `positions`, `asset_value_history`

---

## Horilla Visual Theme

- **Primary accent**: Coral/Red `#E8604C` (Horilla's brand color)
- **Sidebar**: Dark charcoal `#1e1e2d` with coral active indicators
- **Cards**: White with soft shadows, rounded corners
- **Buttons**: Coral primary, gray secondary
- **Status badges**: Green (active/approved), Yellow (pending), Red (rejected/cancelled), Blue (info)
- **Typography**: Clean sans-serif, bold headings, muted descriptions
- **Toggle views**: Card view / List view on every data listing
- **Filter bars**: Top-of-page horizontal filter strips

---

## Complete Module & Feature Inventory

### Module 1: Shell & Dashboard

**Navigation sidebar** (dark theme, icon + text):
- Dashboard, Recruitment, Onboarding, Employee, Attendance, Leave, Payroll, Asset, Performance, Offboarding, Helpdesk

**Dashboard widgets**:
- Total Employees card (with active/inactive breakdown)
- Departments count
- New Hires This Month
- Pending Leave Requests
- Today's Attendance Rate (percentage + bar)
- Upcoming Birthdays (next 7 days, with avatar list)
- Gender Distribution pie chart (Recharts PieChart)
- Department Distribution bar chart (Recharts BarChart)
- Employee Count Trend line chart (monthly, Recharts LineChart)
- Announcements / Notice board section
- Quick Action buttons (Add Employee, Mark Attendance, Apply Leave, Create Ticket)
- Online/Offline Employees indicator

**Notification system**:
- Bell icon in header with unread count badge
- Dropdown showing recent notifications (leave approved, ticket update, etc.)
- Notification types: leave_request, attendance_alert, ticket_update, onboarding_task, asset_request, payslip_generated
- Stored in `hr_notifications` table
- Mark as read / Mark all as read

---

### Module 2: Employee Management

**Models (from Horilla source)**:

`hr_employees`:
- id, badge_id, first_name, last_name, email (unique), phone, address, country, state, city, zip, dob, gender (male/female/other), qualification, experience, marital_status (single/married/divorced), children, emergency_contact, emergency_contact_name, emergency_contact_relation, is_active, profile_image_url, additional_info (JSONB), created_at

`hr_employee_work_info`:
- id, employee_id (FK), department_id (FK to departments), job_position_id (FK), job_role, reporting_manager_id (FK to hr_employees), shift_id (FK), work_type, employee_type, location, company_name, work_email, work_phone, joining_date, contract_end_date, basic_salary, salary_per_hour, experience_years, tags (TEXT[]), additional_info (JSONB)

`hr_employee_bank_details`:
- id, employee_id (FK), bank_name, account_number (unique per employee), branch, address, country, state, city, bank_code_1 (IFSC etc.), bank_code_2, additional_info (JSONB)

`hr_employee_notes`:
- id, employee_id (FK), description, updated_by (FK to hr_employees), note_files (TEXT[]), created_at

`hr_employee_tags`:
- id, title, color

`hr_policies`:
- id, title, body, is_visible_to_all, attachments (TEXT[]), created_at

`hr_disciplinary_actions`:
- id, employee_ids (UUID[]), action_type (warning/suspension/dismissal), description, unit_in (days/hours), duration, start_date, attachment_url

`hr_bonus_points`:
- id, employee_id (FK), points, reason, created_at

**Features**:
- Employee Directory with Card View + List View toggle
- Advanced filters: department, job position, employment type, status, gender, search
- Employee Profile page with tabbed layout:
  - Personal Info tab
  - Work Info tab
  - Bank Details tab
  - Documents tab
  - Notes tab (with file attachments)
  - Activity Timeline tab
- Add Employee dialog (multi-step: Basic Info -> Work Info -> Bank Details -> Documents)
- Edit Employee (inline editing per tab)
- Archive/Unarchive employee (with dependency check: cannot archive if reporting manager)
- Bulk import employees (CSV/Excel upload)
- Export employees to Excel/CSV
- Employee badge ID auto-generation with configurable prefix
- Employee online/offline status indicator
- Subordinate employees view (who reports to whom)
- Birthday tracking and display
- Leave status indicator on employee card (On Leave, Expected Working, On Break)
- Policies management (CRUD, visibility controls, attachments)
- Disciplinary Actions management
- Bonus Points system (per employee, with history tracking)

**PDF Reports**:
- Employee Profile PDF (personal + work + bank details)
- Employee Directory PDF (filtered list export)

---

### Module 3: Recruitment

**Models**:

`hr_skills`:
- id, title

`hr_survey_templates`:
- id, title, description, is_general_template

`hr_recruitments`:
- id, title, description, is_event_based, closed, is_published, vacancy, start_date, end_date, skill_ids (UUID[]), created_at

`hr_recruitment_managers`:
- id, recruitment_id (FK), employee_id (FK)

`hr_recruitment_open_positions`:
- id, recruitment_id (FK), job_position_id (FK)

`hr_stages`:
- id, recruitment_id (FK), stage_name, stage_type (initial/applied/test/interview/cancelled/hired), sequence

`hr_stage_managers`:
- id, stage_id (FK), employee_id (FK)

`hr_candidates`:
- id, name, email, mobile, profile_image_url, resume_url, portfolio_url, recruitment_id (FK), job_position_id (FK), stage_id (FK), gender, address, country, state, city, zip, dob, source (application/software/other), start_onboard, hired, canceled, converted, joining_date, offer_letter_status (not_sent/sent/accepted/rejected/joined), sequence, rating, referral_id (FK to hr_employees), schedule_date, hired_date, created_at

`hr_rejected_candidates`:
- id, candidate_id (FK), reject_reason, description

`hr_stage_notes`:
- id, candidate_id (FK), stage_id (FK), description, updated_by (FK)

`hr_candidate_ratings`:
- id, candidate_id (FK), employee_id (FK), rating (1-5)

**Features**:
- Recruitment Dashboard showing all campaigns (open/closed)
- Create/Edit Recruitment with job positions, vacancy count, dates, skills, managers
- Pipeline/Kanban View per recruitment (drag candidates between stages)
- List View of all candidates with filters (stage, recruitment, gender, source, rating)
- Card View of candidates (avatar, name, stage badge, rating stars)
- Candidate Profile dialog (personal info, resume viewer, notes, interview history, rating)
- Add Candidate form (with resume PDF upload, photo upload)
- Move candidate to next/previous stage (with drag or button)
- Schedule interview (date/time picker, interviewer selection)
- Mark as Hired / Rejected (with reason dialog)
- Offer Letter Status tracking (Not Sent -> Sent -> Accepted/Rejected -> Joined)
- Convert Candidate to Employee (one-click conversion, auto-fills employee form)
- Stage Notes (per candidate per stage, with employee attribution)
- Candidate Rating system (1-5 stars, by multiple reviewers)
- Skill Zone / Talent Pool management
- Recruitment surveys/questionnaires
- Archive/Close recruitment

**PDF Reports**:
- Recruitment Summary PDF (vacancy filled, stage-wise count)
- Candidate Profile PDF

---

### Module 4: Onboarding

**Models**:

`hr_onboarding_stages`:
- id, stage_title, recruitment_id (FK), sequence, is_final_stage

`hr_onboarding_stage_managers`:
- id, stage_id (FK), employee_id (FK)

`hr_onboarding_tasks`:
- id, title, description, stage_id (FK)

`hr_onboarding_task_employees`:
- id, task_id (FK), employee_id (FK)

`hr_candidate_stages`:
- id, candidate_id (FK), onboarding_stage_id (FK), stage_id (FK to hr_stages)

`hr_candidate_tasks`:
- id, candidate_task_id (FK to hr_onboarding_tasks), candidate_stage_id (FK), status (todo/in_progress/stuck/done)

**Features**:
- Onboarding Dashboard showing all active onboarding processes
- Auto-creation of initial stage ("Initial") when recruitment is created
- Stage management (add/edit/delete/reorder stages)
- Task management per stage (add/edit/delete tasks, assign employees)
- Per-candidate onboarding progress tracker (which stage, which tasks done)
- Task status workflow: Todo -> In Progress -> Stuck -> Done
- Final stage marking (completing all tasks at final stage = onboarding complete)
- Onboarding progress percentage per candidate
- Stage managers can view and manage their assigned candidates

---

### Module 5: Attendance

**Models**:

`hr_attendance_activities`:
- id, employee_id (FK), attendance_date, clock_in_date, clock_in (TIME), clock_out_date, clock_out (TIME), shift_day

`hr_attendance`:
- id, employee_id (FK, UNIQUE with attendance_date), attendance_date, shift_id (FK), work_type, attendance_clock_in_date, attendance_clock_in (TIME), attendance_clock_out_date, attendance_clock_out (TIME), attendance_worked_hour (VARCHAR HH:MM), minimum_hour (VARCHAR HH:MM), attendance_overtime (VARCHAR HH:MM), attendance_overtime_approve, attendance_validated, at_work_seconds (INT), overtime_seconds (INT), approved_overtime_seconds (INT), is_validate_request, request_description, request_type (create_request/update_request/revalidate_request), is_holiday, approved_by (FK)

`hr_attendance_overtime`:
- id, employee_id (FK), month, year, worked_hours (VARCHAR HH:MM), pending_hours (VARCHAR HH:MM), overtime (VARCHAR HH:MM), overtime_seconds (INT)

`hr_attendance_late_come_early_out`:
- id, attendance_id (FK), employee_id (FK), type (late_come/early_out), date, time_diff

`hr_attendance_validation_conditions`:
- id, validation_at_work (VARCHAR HH:MM), minimum_overtime_to_approve (VARCHAR HH:MM), overtime_cutoff (VARCHAR HH:MM), auto_approve_overtime (BOOL)

`hr_grace_time`:
- id, allowed_time, allowed_time_in_secs (INT), is_default (BOOL)

`hr_shifts`:
- id, name, full_time (VARCHAR HH:MM), minimum_working_hour (VARCHAR HH:MM), grace_time_id (FK)

`hr_shift_days`:
- id, day (monday-sunday)

`hr_shift_schedules`:
- id, shift_id (FK), day_id (FK), start_time (TIME), end_time (TIME), is_night_shift

`hr_work_types`:
- id, name

`hr_penalty_accounts`:
- id, employee_id (FK), penalty_amount, deduction, leave_type_id (FK), minus_leaves, penalty_date

**Features**:
- Clock In / Clock Out buttons (big prominent buttons with current time display)
- Multiple clock-in/out activities per day (break support)
- Daily attendance record auto-calculated from activities (total worked hours, overtime)
- Minimum hour validation (configurable per shift)
- Overtime calculation: worked_hours - minimum_hours
- Overtime approval workflow (manager approves)
- Overtime cutoff (cap max overtime at configurable value)
- Auto-approve overtime if above threshold
- Monthly overtime account (per employee, monthly rollup)
- Attendance validation request workflow (employee requests -> manager validates)
- Late Come / Early Out tracking
- Grace Time configuration
- Holiday/Company Leave auto-detection (minimum_hour set to 00:00)
- Shift Management: create/edit shifts with day schedules (start/end time, night shift flag)
- Work Type management (Office, Remote, Hybrid, etc.)
- Monthly Attendance Calendar View (colored days: present, absent, half-day, holiday)
- Attendance Reports: department-wise, employee-wise, monthly summary
- Batch Attendance marking
- Penalty system for attendance violations (deductions, leave deductions)

**PDF Reports**:
- Monthly Attendance Report PDF (per employee: days present, absent, overtime, late)
- Department Attendance Summary PDF

---

### Module 6: Leave Management

**Models**:

`hr_leave_types`:
- id, name, icon_url, color, payment (paid/unpaid), count, period_in (day/month/year), limit_leave, total_days, reset (BOOL), is_encashable, reset_based (yearly/monthly/weekly), reset_month, reset_day, reset_weekend, carryforward_type (no_carryforward/carryforward/carryforward_expire), carryforward_max, carryforward_expire_in, carryforward_expire_period, carryforward_expire_date, require_approval (yes/no), require_attachment (yes/no), exclude_company_leave (yes/no), exclude_holiday (yes/no), is_compensatory_leave

`hr_available_leave`:
- id, employee_id (FK), leave_type_id (FK, UNIQUE with employee_id), available_days, carryforward_days, total_leave_days, assigned_date, reset_date, expired_date

`hr_leave_requests`:
- id, employee_id (FK), leave_type_id (FK), start_date, end_date, start_date_breakdown (full_day/first_half/second_half), end_date_breakdown, status (requested/approved/cancelled/rejected), description, attachment_url, requested_days, approved_available_days, approved_carryforward_days, reject_reason, created_by (FK), created_at

`hr_leave_allocation_requests`:
- id, employee_id (FK), leave_type_id (FK), requested_days, status (requested/approved/rejected), description, created_by (FK), created_at

`hr_compensatory_leave_requests`:
- id, employee_id (FK), leave_type_id (FK), attendance_id (FK), requested_date, status, created_at

`hr_restrict_leave`:
- id, leave_type_id (FK), start_date, end_date, description

`hr_holidays`:
- id, name, start_date, end_date, recurring (BOOL)

`hr_company_leaves`:
- id, based_on_week, based_on_week_day

**Features**:
- Leave Type Configuration (full CRUD with all Horilla fields):
  - Paid/Unpaid toggle
  - Day limits
  - Reset mechanism (yearly/monthly/weekly with specific date/day)
  - Carryforward rules (none, carry, carry with expiry)
  - Approval requirement toggle
  - Attachment requirement toggle
  - Exclude company holidays / public holidays
  - Compensatory leave type flag
  - Custom icon and color per leave type
- Leave Request form:
  - Employee selector
  - Leave type selector (shows available balance)
  - Date range picker
  - Half-day support (first half / second half for start and end dates)
  - Requested days auto-calculation (excluding holidays/company leaves if configured)
  - Description field
  - Attachment upload (if required by leave type)
- Leave Approval workflow:
  - Pending requests list for managers
  - Approve / Reject with reason
  - Multi-level approval (if configured)
- Leave Balance Dashboard:
  - Per-employee balance cards (one per leave type: available, used, carryforward)
  - Balance history tracking
- Leave Calendar View:
  - Monthly calendar showing who is on leave each day
  - Color-coded by leave type
- Leave Allocation:
  - Managers can allocate additional leave days to employees
  - Allocation request workflow
- Compensatory Leave:
  - Request comp leave for working on holiday/company leave
  - Links to attendance record as proof
- Restricted Leave Dates:
  - Block specific date ranges from leave requests
- Holiday Calendar:
  - CRUD holidays with recurring support
- Company Leave Configuration:
  - Weekly off days (e.g., every Saturday, 2nd and 4th Saturday)

**PDF Reports**:
- Leave Balance Report PDF (all employees, all leave types)
- Leave Summary PDF (date range, department filter)

---

### Module 7: Payroll

**Models**:

`hr_filing_statuses`:
- id, filing_status, based_on (basic_pay/gross_pay/taxable_gross_pay), description

`hr_contracts`:
- id, contract_name, employee_id (FK), contract_start_date, contract_end_date, wage_type (daily/monthly/hourly), pay_frequency (weekly/monthly/semi_monthly), wage (NUMERIC basic salary), filing_status_id (FK), contract_status (draft/active/expired/terminated), department_id (FK), job_position_id (FK), notice_period_in_days (INT), contract_document_url, deduct_leave_from_basic_pay (BOOL), calculate_daily_leave_amount (BOOL), deduction_for_one_leave_amount (NUMERIC), note

`hr_work_records`:
- id, employee_id (FK), date, work_record_type (FDP/HDP/ABS/HD/CONF/DFT), at_work (VARCHAR HH:MM)

`hr_allowances`:
- id, title, is_taxable, is_condition_based, field (basic_pay/gross_pay/etc.), condition (gt/lt/eq/etc.), value (NUMERIC), based_on (amount/percentage), amount (NUMERIC), is_fixed (BOOL), if_condition (VARCHAR), if_amount (NUMERIC), other_conditions (JSONB)

`hr_deductions`:
- id, title, is_taxable, is_condition_based, field, condition, value, based_on, amount, is_fixed, if_condition, if_amount, other_conditions (JSONB), is_pretax (BOOL), employer_rate (NUMERIC), employee_rate (NUMERIC)

`hr_payslips`:
- id, employee_id (FK), start_date, end_date, contract_wage (NUMERIC), basic_pay (NUMERIC), gross_pay (NUMERIC), net_pay (NUMERIC), deduction (NUMERIC), status (draft/review_ongoing/confirmed/paid), pay_head_data (JSONB -- breakdown of all allowances/deductions), batch_id, sent_to_employee (BOOL)

`hr_loan_accounts`:
- id, employee_id (FK), loan_amount (NUMERIC), installment_amount (NUMERIC), provided_date, installment_start_date, settled (BOOL), total_paid (NUMERIC)

`hr_reimbursements`:
- id, employee_id (FK), title, type (reimbursement/leave_encashment), amount, description, attachment_url, status (requested/approved/rejected), approved_by (FK)

`hr_federal_tax`:
- id, filing_status_id (FK), min_income, max_income, tax_rate, fixed_amount

**Features**:
- Contract Management:
  - Create/Edit/View employee contracts
  - Contract statuses: Draft -> Active -> Expired/Terminated
  - Only one active contract per employee
  - Wage type support (daily/monthly/hourly)
  - Pay frequency options
  - Notice period tracking
  - Contract document upload
  - Leave deduction configuration per contract
- Allowance Management:
  - Create allowances (fixed amount or percentage-based)
  - Condition-based allowances (if basic_pay > X, then apply)
  - Taxable/Non-taxable toggle
  - Multiple condition support (AND/OR logic)
- Deduction Management:
  - Same structure as allowances
  - Pre-tax / Post-tax toggle
  - Employer/Employee contribution rates (for PF, ESI, etc.)
- Payslip Generation:
  - Batch generation (select date range + employees/department)
  - Auto-calculation: Basic Pay + Allowances - Deductions = Net Pay
  - Work record integration (present days, absent days, half-days)
  - Leave deduction from basic pay (configurable)
  - Overtime pay calculation
  - Tax calculation based on filing status and tax brackets
  - Loan installment auto-deduction
  - Reimbursement inclusion
  - Pay head breakdown stored as JSONB
- Payslip Workflow: Draft -> Review Ongoing -> Confirmed -> Paid
- Individual Payslip View (detailed breakdown with all heads)
- Send payslip to employee (email or in-app notification)
- Loan Management:
  - Create employee loan with installment plan
  - Auto-deduct installments from payslips
  - Track total paid vs remaining
  - Mark as settled
- Reimbursement Management:
  - Employee submits reimbursement request
  - Manager approves/rejects
  - Approved amount added to next payslip
  - Leave encashment as reimbursement type
- Filing Status Configuration:
  - Define tax filing statuses
  - Link to tax brackets
- Federal Tax Configuration:
  - Tax slabs per filing status
  - Min/max income ranges with rates

**PDF Reports**:
- Individual Payslip PDF (company logo, employee details, pay breakdown table, net pay, signatures)
- Payroll Summary PDF (all employees for a period, totals)
- Salary Register PDF (department-wise salary breakdown)

---

### Module 8: Asset Management

**Models**:

`hr_asset_categories`:
- id, name, description

`hr_asset_lots`:
- id, lot_number (unique), description

`hr_assets`:
- id, name, description, tracking_id (unique), purchase_date, purchase_cost (NUMERIC), category_id (FK), status (in_use/available/not_available), lot_id (FK), expiry_date, notify_before_days (INT)

`hr_asset_reports`:
- id, asset_id (FK), title

`hr_asset_documents`:
- id, report_id (FK), file_url

`hr_asset_assignments`:
- id, asset_id (FK), assigned_to_id (FK to hr_employees), assigned_date, assigned_by_id (FK), return_date, return_condition, return_status (minor_damage/major_damage/healthy), return_request (BOOL)

`hr_asset_requests`:
- id, requested_employee_id (FK), category_id (FK), request_date, description, status (requested/approved/rejected)

**Features**:
- Asset Category management (CRUD)
- Asset Lot/Batch management
- Asset Registry (full CRUD):
  - Name, description, tracking ID, purchase date, cost, category, status, lot/batch
  - Expiry date with notification reminder
  - Card View and List View
  - Filters: category, status, lot, search
- Asset Assignment:
  - Assign asset to employee (with assignment images)
  - Track assigned date, assigned by
  - Return workflow (return date, condition assessment, return status, return images)
  - Return request by employee
- Asset Request:
  - Employee requests an asset by category
  - Manager approves/rejects
  - Approved -> auto-create assignment
- Asset Reports per asset (documents collection)
- Asset depreciation tracking (calculated from purchase cost and age)

**PDF Reports**:
- Asset Registry PDF (all assets with status)
- Asset Assignment History PDF (per asset)

---

### Module 9: Performance Management (PMS)

**Models**:

`hr_pms_periods`:
- id, period_name (unique), start_date, end_date

`hr_pms_key_results`:
- id, title, description, progress_type (%/#/$), target_value (NUMERIC), start_value (NUMERIC), current_value (NUMERIC), duration (INT days)

`hr_pms_objectives`:
- id, title, description, managers (UUID[]), duration_type (days/months/years), duration (INT), key_result_ids (UUID[])

`hr_pms_employee_objectives`:
- id, employee_id (FK), objective_id (FK), status (not_started/tracking/closed), start_date, end_date, key_result_ids (UUID[])

`hr_pms_employee_key_results`:
- id, employee_objective_id (FK), key_result_id (FK), current_value (NUMERIC), target_value (NUMERIC), progress_percentage (NUMERIC), status (on_track/at_risk/behind), start_date, end_date, updated_at

`hr_pms_feedback`:
- id, employee_id (FK), manager_id (FK), review (TEXT), status (requested/on_track/at_risk/behind/closed), period_id (FK), key_result_id (FK), answer_data (JSONB)

`hr_pms_question_templates`:
- id, title, is_default (BOOL)

`hr_pms_questions`:
- id, template_id (FK), question_text, question_type (text/rating/boolean/likert), options (JSONB)

`hr_pms_answers`:
- id, feedback_id (FK), question_id (FK), answer_text, rating (INT)

**Features**:
- Period Management (define review periods with date ranges)
- Key Result Definition:
  - Title, description
  - Progress type: Percentage (%), Number (#), Currency ($, INR, EUR)
  - Target value and start value
  - Duration tracking
- Objective Management:
  - Link multiple key results to an objective
  - Assign managers
  - Duration configuration
- Employee Objectives:
  - Assign objectives to employees
  - Status tracking: Not Started -> Tracking -> Closed
  - Per-employee key result progress tracking
  - Progress percentage auto-calculation
  - Visual progress bars (colored by status: green on-track, yellow at-risk, red behind)
- 360-Degree Feedback:
  - Manager creates feedback request
  - Status workflow: Requested -> On Track -> At Risk -> Behind -> Closed
  - Linked to specific key results and review periods
  - Structured answers via question templates
- Question Templates:
  - Create templates with multiple question types (text, rating 1-5, boolean, likert scale)
  - Default template support
- Performance Dashboard:
  - Department-wise performance overview
  - Top performers widget
  - Objective completion rates chart
  - Key Result progress summary

**PDF Reports**:
- Performance Review PDF (employee objectives, key results, feedback summary)
- Department Performance Summary PDF

---

### Module 10: Offboarding

**Models**:

`hr_offboarding`:
- id, title, description, status (ongoing/completed), manager_ids (UUID[])

`hr_offboarding_stages`:
- id, offboarding_id (FK), title, type (interview/handover/fnf/other), sequence

`hr_offboarding_stage_approvals`:
- id, stage_id (FK), manager_id (FK)

`hr_offboarding_tasks`:
- id, stage_id (FK), title, description, employee_ids (UUID[])

`hr_offboarding_employees`:
- id, employee_id (FK), offboarding_id (FK), current_stage_id (FK), status (active/completed)

`hr_offboarding_employee_tasks`:
- id, offboarding_employee_id (FK), task_id (FK), status (todo/in_progress/done)

`hr_resignation_letters`:
- id, employee_id (FK), description, status (requested/approved/rejected), created_at

**Features**:
- Offboarding Pipeline creation:
  - Auto-creates 3 default stages: Exit Interview, Work Handover, FnF (Final Settlement)
  - Add custom stages with sequence ordering
- Assign employees to offboarding pipeline
- Per-employee stage tracking (current stage, tasks completed)
- Task assignment per stage (with responsible employees)
- Task completion workflow
- Stage approval by managers
- Resignation Letter Management:
  - Employee submits resignation
  - Manager approves/rejects
  - Approved -> initiate offboarding pipeline
- Exit Interview recording
- Final Settlement calculation integration (with payroll)
- Clearance checklist tracking

**PDF Reports**:
- Offboarding Clearance Form PDF
- Exit Interview Summary PDF

---

### Module 11: Helpdesk

**Models**:

`hr_helpdesk_categories`:
- id, name, department_id (FK), manager_ids (UUID[])

`hr_helpdesk_faq_categories`:
- id, name

`hr_helpdesk_faqs`:
- id, category_id (FK), question, answer

`hr_helpdesk_tags`:
- id, name, color

`hr_helpdesk_tickets`:
- id, title, description, employee_id (FK to hr_employees, the requester), category_id (FK), ticket_type (suggestion/complaint/service_request/meeting_request/anonymous_complaint/others), priority (low/medium/high), status (new/in_progress/on_hold/resolved/canceled), assigning_type (department/job_position/individual), assigned_to (UUID[]), tag_ids (UUID[]), attachment_urls (TEXT[]), deadline, created_at, updated_at

`hr_helpdesk_comments`:
- id, ticket_id (FK), employee_id (FK), comment, attachment_url, created_at

**Features**:
- Ticket Dashboard:
  - Summary cards (New, In Progress, On Hold, Resolved, Total)
  - Tickets by priority chart
  - Tickets by category chart
  - Recent tickets list
- Ticket Creation:
  - Title, description, type, priority, category
  - Anonymous complaint option (hides submitter identity)
  - File attachments
  - Deadline setting
  - Tag assignment
- Ticket List View:
  - Filters: status, priority, category, type, date range
  - Card and List view toggles
  - Search
- Ticket Detail View:
  - Full ticket info
  - Status update workflow (New -> In Progress -> On Hold -> Resolved -> Canceled)
  - Comment thread (with attachments)
  - Assignment management (by department, job position, or individual)
  - Activity timeline
- Category Management:
  - Link categories to departments
  - Assign default managers per category
  - Auto-routing of tickets to category managers
- FAQ / Knowledge Base:
  - FAQ categories
  - FAQ CRUD (question + answer)
  - Searchable FAQ listing
  - Employees can browse before creating ticket
- Tag Management (for ticket tagging)
- SLA tracking (deadline vs resolution time)

**PDF Reports**:
- Ticket Summary PDF (date range, filters)

---

## Database Schema Summary

**Total new tables**: 55+

All tables use `hr_` prefix, have RLS enabled with SELECT/INSERT/UPDATE/DELETE policies for authenticated users, and use UUID primary keys with `gen_random_uuid()`.

---

## Phased Implementation Plan

### Phase 1: Shell + Employee Management (This conversation)
- Create `HorillaHRMS.tsx` shell page with dark sidebar
- Create `HorillaSidebar.tsx` with all module nav items
- Create `HorillaDashboard.tsx` with summary widgets and charts
- Create database tables: `hr_employees`, `hr_employee_work_info`, `hr_employee_bank_details`, `hr_employee_notes`, `hr_employee_tags`, `hr_bonus_points`, `hr_policies`, `hr_notifications`
- Build Employee Directory (card + list views, filters, search)
- Build Employee Profile (tabbed: personal, work, bank, documents, notes)
- Build Add/Edit Employee dialogs
- Build Notification system (bell icon, dropdown, table)
- Update sidebar: replace HR Management group with single HRMS link
- Update routes: `/hrms` points to new shell

### Phase 2: Recruitment + Onboarding
- Create tables: `hr_skills`, `hr_recruitments`, `hr_stages`, `hr_candidates`, `hr_stage_notes`, `hr_candidate_ratings`, `hr_onboarding_stages`, `hr_onboarding_tasks`, `hr_candidate_stages`, `hr_candidate_tasks`
- Build Recruitment Dashboard, Pipeline Kanban, Candidate Profiles
- Build Onboarding Dashboard, Stage/Task management

### Phase 3: Attendance + Leave
- Create tables: `hr_shifts`, `hr_shift_days`, `hr_shift_schedules`, `hr_work_types`, `hr_attendance_activities`, `hr_attendance`, `hr_attendance_overtime`, `hr_grace_time`, `hr_leave_types`, `hr_available_leave`, `hr_leave_requests`, `hr_holidays`, `hr_company_leaves`, etc.
- Build Clock In/Out, Attendance Calendar, Overtime Management
- Build Leave Types Config, Leave Request/Approval, Leave Balance, Leave Calendar

### Phase 4: Payroll + Asset Management
- Create tables: `hr_contracts`, `hr_allowances`, `hr_deductions`, `hr_payslips`, `hr_work_records`, `hr_loan_accounts`, `hr_reimbursements`, `hr_federal_tax`, `hr_asset_categories`, `hr_assets`, `hr_asset_assignments`, `hr_asset_requests`
- Build Contract Management, Allowance/Deduction Config, Payslip Generation, Payslip PDF
- Build Asset Registry, Assignment, Request workflow

### Phase 5: Performance + Offboarding + Helpdesk
- Create tables: `hr_pms_periods`, `hr_pms_objectives`, `hr_pms_key_results`, `hr_pms_employee_objectives`, `hr_pms_feedback`, `hr_offboarding`, `hr_offboarding_stages`, `hr_offboarding_tasks`, `hr_resignation_letters`, `hr_helpdesk_tickets`, `hr_helpdesk_categories`, `hr_helpdesk_faqs`, etc.
- Build OKR/Goal Management, 360 Feedback, Performance Dashboard
- Build Offboarding Pipeline, Resignation Management
- Build Helpdesk Tickets, FAQ, Categories

### Phase 6: Cleanup + Polish
- Remove old HRMS/EMS/Payroll pages and components
- Drop old database tables
- PDF report templates for all modules
- Theme consistency pass
- Final testing

---

## Technical Details

### File Structure

```text
src/pages/HorillaHRMS.tsx

src/components/horilla/
  HorillaSidebar.tsx
  HorillaDashboard.tsx
  HorillaHeader.tsx
  HorillaNotifications.tsx

  employee/
    EmployeeDirectory.tsx
    EmployeeProfile.tsx
    AddEmployeeDialog.tsx
    EmployeeWorkInfoTab.tsx
    EmployeeBankDetailsTab.tsx
    EmployeeDocumentsTab.tsx
    EmployeeNotesTab.tsx
    PoliciesManagement.tsx
    DisciplinaryActions.tsx
    BonusPoints.tsx

  recruitment/
    RecruitmentDashboard.tsx
    RecruitmentPipeline.tsx
    CandidateProfile.tsx
    CreateRecruitmentDialog.tsx
    InterviewScheduleDialog.tsx
    OfferLetterManagement.tsx
    SkillZone.tsx
    SurveyManagement.tsx

  onboarding/
    OnboardingDashboard.tsx
    OnboardingStages.tsx
    CandidateOnboarding.tsx
    TaskManagement.tsx

  attendance/
    AttendanceDashboard.tsx
    ClockInOut.tsx
    AttendanceCalendar.tsx
    OvertimeManagement.tsx
    ShiftManagement.tsx
    AttendanceSettings.tsx
    PenaltyManagement.tsx

  leave/
    LeaveDashboard.tsx
    LeaveTypes.tsx
    LeaveRequests.tsx
    LeaveCalendar.tsx
    LeaveBalance.tsx
    LeaveAllocation.tsx
    HolidayCalendar.tsx
    CompanyLeaves.tsx
    RestrictedLeaves.tsx

  payroll/
    PayrollDashboard.tsx
    ContractManagement.tsx
    AllowanceManagement.tsx
    DeductionManagement.tsx
    PayslipGeneration.tsx
    PayslipView.tsx
    LoanManagement.tsx
    ReimbursementManagement.tsx
    FilingStatusConfig.tsx
    TaxBracketConfig.tsx

  asset/
    AssetDashboard.tsx
    AssetCategories.tsx
    AssetDirectory.tsx
    AssetAssignment.tsx
    AssetRequests.tsx
    AssetReports.tsx

  performance/
    PerformanceDashboard.tsx
    PeriodManagement.tsx
    ObjectiveManagement.tsx
    KeyResultManagement.tsx
    EmployeeObjectives.tsx
    FeedbackManagement.tsx
    QuestionTemplates.tsx

  offboarding/
    OffboardingDashboard.tsx
    OffboardingPipeline.tsx
    ResignationRequests.tsx
    TaskTracking.tsx

  helpdesk/
    HelpdeskDashboard.tsx
    TicketList.tsx
    TicketDetail.tsx
    CategoryManagement.tsx
    FAQManagement.tsx
    TagManagement.tsx

  shared/
    HorillaCard.tsx
    HorillaTable.tsx
    HorillaFilterBar.tsx
    ViewToggle.tsx
    StatusBadge.tsx
    HorillaPdfGenerator.ts
```

### Routing
- `/hrms` renders HorillaHRMS shell
- Internal navigation via React state (activeModule), not separate URL routes
- Old `/ems` and `/payroll` routes removed

### Charts (Recharts)
- PieChart for gender distribution, department distribution
- BarChart for attendance overview, ticket categories
- LineChart for employee count trends, performance trends
- AreaChart for leave trends

### PDF Generation (jsPDF + jspdf-autotable)
- Payslip PDF with company branding
- Attendance reports
- Leave balance reports
- Employee profile export
- Recruitment summary
- Asset registry
- Performance review
- Ticket summary

