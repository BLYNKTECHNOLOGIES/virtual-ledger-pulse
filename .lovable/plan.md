
# Inline Razorpay + 3-Way Data Health

Two parallel deliverables:

1. **Inline Razorpay everywhere** — remove the need to go to the standalone Razorpay Sync page. Every HRMS surface where a field lives that also exists in RazorpayX gets an "Also update in Razorpay" toggle (default ON) right on that form.
2. **Data Health module** — a dedicated page plus per-employee drift badge that continuously reconciles HRMS ↔ RazorpayX ↔ eSSL biometric on every intersecting field, so any divergence is visible and one-click resolvable.

---

## Part A — Inline Razorpay Push/Pull

### A1. Shared push primitive
Extend `src/lib/razorpayPushback.ts` with typed helpers so every form calls the same code path:
- `pushPersonalToRazorpay(empId, {first_name, last_name, gender, dob, email, phone, pan, aadhaar})`
- `pushEmploymentToRazorpay(empId, {date_of_joining, department, designation, employee_code, location})`
- `pushBankToRazorpay(empId, {account_number, ifsc, holder_name})`
- `pushSalaryToRazorpay(empId, {annual_ctc, effective_from})`
- `pushDismissalToRazorpay(empId, {last_working_day})` *(already exists — kept)*
- `pullPersonFull(empId)` *(already exists — wrapped)*

Every helper returns `{ok, code, message, drift?}` and writes a row to a new `hr_razorpay_pushback_log` so the Data Health page has an audit trail.

Each helper is a thin wrapper over a matching action in `razorpay-payroll-proxy`:
- `create_person` (exists)
- `update_person_personal`, `update_person_employment`, `update_person_bank`, `update_person_salary` (new — all use RazorpayX `/people` sub-types documented in the Opfin API)
- `people_dismiss` (exists)

If Razorpay returns 403 because `push_salary_endpoint_verified=false`, the helper degrades to a warning toast and logs the intent for later replay — the ERP save always succeeds first.

### A2. Reusable UI primitive
`src/components/hrms/primitives/RazorpayPushToggle.tsx` — a small toggle + status pill (`Synced` / `Drift` / `Not linked` / `Pending verify`) that any form can drop next to its Save button. It reads `hr_razorpay_employee_map` to know if the employee is linked; if not, it renders "Not in Razorpay — create?" which invokes `create_person`.

### A3. Surfaces to wire it into
| Surface | File | Fields pushed |
|---|---|---|
| Add Employee dialog | `AddEmployeeDialog.tsx` | Personal + optional create_person |
| Edit Employee dialog | `EditEmployeeDialog.tsx` | Personal + employment |
| Employee Profile → Personal card | `EmployeeProfilePage.tsx` | Personal |
| Employee Profile → Work Info card | `EmployeeProfilePage.tsx` | Employment (dept, designation, DOJ, location) |
| Employee Profile → Bank card | `EmployeeProfilePage.tsx` | Bank (already has pull; add push) |
| Revise Salary dialog | `ReviseSalaryDialog.tsx` | Salary at effective date |
| Onboarding Stage 5 | `Stage5Finalization.tsx` | Already wired for create; extend to push bank + salary snapshot on finalize |
| Resignation / FNF | `ResignationTab.tsx` | Dismissal (exists); also push FNF payout amount + date |
| Bulk Completion Panel | `BulkCompletionPanel.tsx` | Add "Also mirror to Razorpay" checkbox on bulk DOJ / salary / bank flows |

Toggle default = ON everywhere; state persisted per-user in `user_preferences` under `razorpay_push_default` so an operator can flip it off globally.

### A4. Retire technical UI on the Razorpay Sync page
The standalone page stays as a **power-user diagnostic** (renamed **"Razorpay Diagnostics"**) but is no longer part of the day-to-day flow. The `HRDashboardCompletenessCard` links to Data Health instead.

---

## Part B — 3-Way Data Health (HRMS ↔ RazorpayX ↔ eSSL)

### B1. Intersecting-field matrix
Canonical list of fields that must agree across systems (drives both the drift detector and the resolve UI):

```text
FIELD              HRMS source                   Razorpay source                 eSSL source
full_name          hr_employees.first+last       people.name                     hr_biometric_device_users.name
email              hr_employees.email            people.email                    —
phone              hr_employees.phone            people.contact-number           —
dob                hr_employees.dob              people.date-of-birth            —
gender             hr_employees.gender           people.gender                   —
pan                hr_employee_work_info.pan     people.pan                      —
date_of_joining    hr_employee_work_info.joining people.date-of-hiring           —
department         hr_employee_work_info.dept    people.department               hr_biometric_device_users.department
designation        hr_employee_work_info.job_pos people.designation              hr_biometric_device_users.title
employee_code      hr_employees.badge_id         people.employee-id              hr_biometric_device_users.pin (mapped)
active/dismissed   hr_employees.is_active        people.date-of-dismissal null   hr_biometric_device_users.enabled
bank_account       hr_employee_bank_details.acc  people.bank-account-number      —
bank_ifsc          hr_employee_bank_details.ifsc people.bank-ifsc                —
annual_ctc         hr_employee_salary_structures people.salary annual_ctc        —
attendance_month   hr_attendance_daily rollup    payroll.attendance-input        hr_attendance_punches rollup
```

### B2. Drift detector
- New scheduled edge function `hr-drift-scan` (runs every 30 min + on-demand):
  1. Enumerates all active `hr_employees`.
  2. For each, pulls the latest Razorpay snapshot from `hr_razorpay_employee_map.last_pull_snapshot` (refreshing via `pull_person_full` if stale > 24h).
  3. Reads latest eSSL row via `hr_biometric_device_users` matched by `pin ↔ badge_id`.
  4. Compares each field in the matrix, writing rows to a new table `hr_drift_alerts` scoped to (employee_id, field, systems_involved, hrms_value, razorpay_value, essl_value, severity, first_seen_at, resolved_at).
  5. `severity` = high for identity/bank/status mismatches, medium for name/dept, low for cosmetic case/whitespace differences.
- Resolved drift rows are kept for audit; a materialized view `hr_drift_open` powers the UI.

### B3. Data Health page (`/hrms/data-health`)
- **Header KPIs**: total open drifts, count per severity, count per system-pair, employees affected.
- **Filters**: severity, system pair (HRMS↔RZP, HRMS↔eSSL, RZP↔eSSL), field, department.
- **Row per drift** with three-column value display (HRMS | Razorpay | eSSL) and three actions:
  - `Adopt HRMS` → pushes HRMS value to the other systems using the Part-A helpers.
  - `Adopt Razorpay` → pulls into HRMS (and eSSL where applicable via device command).
  - `Adopt eSSL` → writes eSSL value into HRMS, then propagates to Razorpay.
- Bulk resolve: select many rows with the same field and adopt-source in one click.
- Every action goes through the same pushback helpers so it's auditable in `hr_razorpay_pushback_log` and `hr_biometric_device_commands`.

### B4. Per-employee drift badge
- Small pill (`⚠ 3 drifts`) added to:
  - Employee list rows (`EmployeeList.tsx`)
  - Employee profile header (`EmployeeProfilePage.tsx`)
  - Onboarding wizard header when a linked Razorpay ID exists
- Click opens a filtered Data Health drawer for that employee only.

### B5. Attendance/CTC parity
- Attendance: nightly cron aggregates `hr_attendance_daily` per employee per pay period and diffs against the `attendance-input` payload Razorpay expects for the next payroll run. Any diff > tolerance surfaces as a drift.
- CTC: on every `hr_salary_revisions` insert with `status='approved'`, compare against Razorpay salary snapshot; if divergent and push toggle was off, log a drift.

---

## Technical notes

- **New DB objects (single migration)**: `hr_razorpay_pushback_log`, `hr_drift_alerts`, `hr_drift_open` view, `user_preferences.razorpay_push_default` column, index on `hr_drift_alerts (employee_id, resolved_at)`. All with GRANTs (authenticated select+insert+update, service_role all) and RLS gated on `hrms_razorpay_sync` OR `user_management_hr_manage`.
- **Edge functions**: extend `razorpay-payroll-proxy` with 4 new actions; add `hr-drift-scan` with a cron trigger.
- **Auth gate**: all push helpers require the caller to have `hrms_razorpay_sync` permission; Data Health resolve actions require `hrms_razorpay_sync` for RZP-touching adoptions and `hrms_biometric_manage` for eSSL-touching adoptions.
- **Failure model**: ERP write is the source of truth on save. Razorpay push failure = non-fatal toast + drift row auto-created so it can be retried from Data Health. Never blocks the HR workflow.
- **`push_salary_endpoint_verified` gate**: honored — if false, salary pushes are queued as drifts instead of attempted, with a banner on Data Health explaining how to flip the gate.
- **Custom instructions compliance**: every new Razorpay call is validated against the Opfin/RazorpayX `/people` sub-type spec; no invented endpoints, no shadow fields. Where an intersecting field has no supported endpoint (rare), Data Health marks it read-only and explains why.

## Rollout order

1. Migration + `hr_razorpay_pushback_log`, `hr_drift_alerts` tables.
2. Proxy: new update actions + drift-scan function.
3. `razorpayPushback.ts` helpers + `RazorpayPushToggle` primitive.
4. Wire toggle into every listed surface (Part A3).
5. Data Health page + per-employee badge (Part B3, B4).
6. Attendance/CTC parity crons (Part B5).
7. Rename Razorpay Sync page → Diagnostics; update dashboard links.
