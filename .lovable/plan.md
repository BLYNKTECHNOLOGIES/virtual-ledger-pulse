# RazorpayX — Wire the Remaining 11 Endpoints (Updated)

Ship every un-wired endpoint. Default to inline placement inside surfaces that already exist; introduce a new surface **only** where the API is org-wide by nature.

Un-wired endpoints covered: `payroll/add-additions`, `payroll/add-deduction`, `payroll/reset-modifications`, `payroll/do-not-pay`, `contractor-payment/create|delete|list-pending|get-status`, `attendance/fetch`, PATCH `attendance/modify`, `advance-salary/create`.

Bundled with this build: surface response fields we currently ignore — `do-not-pay` as a red "Paused" badge, `payment-status`/`paid-on` as a "Paid on …" pill, and promote `pf` / `esi` / `professional-tax` from JSONB to first-class columns on `hr_payslips`.

---

## 1. Payroll month adjustments — inline on the Payslip row  *(no new page)*

**Home:** `RazorpayPayslipsSection.tsx` (already on `EmployeeProfilePage` → Payroll tab).

Each *unpaid* month row grows a **`⋯ Adjust`** kebab that opens one dialog `PayrollAdjustmentDialog.tsx` with three tabs + a footer action:
- **Addition** — name, amount, taxable → `payroll/add-additions`.
- **Deduction** — name, amount → `payroll/add-deduction`.
- **Pause / Resume** — switch → `payroll/do-not-pay`.
- **Reset month** (footer, `AlertDialog` confirm) → `payroll/reset-modifications`.

After each write the dialog re-issues `payroll/view-payroll` and reflects `salary` / `additions` / `deduction-amount` / `do-not-pay` on the row. A red **"Paused"** badge finally consumes the previously-ignored `do-not-pay` field; a green **"Paid on …"** pill consumes `payment-status` + `paid-on`.

Gate: `hr_razorpay_settings.enable_payroll_writes` + `payroll_manage` permission.

---

## 2. Advance Salary — inline on the Loans row  *(no new page)*

**Home:** Loans tab on `EmployeeProfilePage`.

When a loan has `loan_type = 'salary_advance'` and `status = 'approved'`, its row shows a **"Push to RazorpayX"** button → `advance-salary/create` → store `advance-salary-id` and `razorpay_pushed_at` on the loan row. Button then reads "Pushed · #13908" and disables. Next month's `payroll/view-payroll` deduction reflects auto-recovery — already rendered.

**Schema:** add `razorpay_advance_salary_id INT`, `razorpay_pushed_at TIMESTAMPTZ` to `hr_loans`.

---

## 3. Contractor Payouts — **new page justified**  *(one new tab inside RazorpaySyncPage hub, not a new sidebar entry)*

`contractor-payment/list-pending` returns the whole org's pending queue and `get-status` is cross-employee — an org-wide view is genuinely needed. Ship it as a **new tab inside the existing `RazorpaySyncPage`** plus a compact inline card on the employee profile.

**New tab component** `ContractorPayoutsHub.tsx`:
- Table of all pending payouts from `contractor-payment/list-pending` (columns: employee link, `executeOn`, `amount`, `tax`, `purpose`, `remarks`, status pill).
- Row actions: **Refresh status** → `get-status`; **Delete** (only if `paid=false`) → `delete`.
- Top-right: **"New payout"** modal → `contractor-payment/create` (contractor picker restricted to `employee_type='contractor'`).
- Filters: employee, month, paid/pending.

**Inline mirror on employee profile:** small `ContractorPayoutsSection.tsx` collapsible on `EmployeeProfilePage`, rendered **only when `hr_employees.employee_type = 'contractor'`**. Same actions, scoped to that contractor's email — links to the hub for the org-wide view.

**Schema:** new table `hr_razorpay_contractor_payments` (razorpay_payment_id INT PK, hr_employee_id UUID, amount NUMERIC, tax NUMERIC, purpose TEXT, execute_on DATE, remarks TEXT, paid BOOL, last_synced_at TIMESTAMPTZ, created_by UUID, created_at, updated_at). GRANTs + RLS (authenticated read, HR/Super Admin write, service_role all) + updated_at trigger.

---

## 4. Attendance `fetch` — Reconcile utility inline  *(no new page)*

**Home:** `AttendancePeriodLockPage.tsx`.

Each employee row gets a **"Verify Razorpay"** icon-only button. Click → proxy `attendance_fetch_range` iterates the locked month calling `attendance/fetch` per day → compact diff popover of HR-engine vs. Opfin `status.description` / `leave-type.description` / `check-in` / `check-out` / `requested-*`. Read-only diff (previously all ❌ fields become visible).

---

## 5. Attendance PATCH `modify` — auto-routed from regularization  *(no UI surface)*

When HR approves a regularization for a day whose month is already locked **and** previously pushed to Opfin (row exists in `hr_razorpay_pushback_log` with `attendance_push_apply`), the approval calls new proxy action `attendance_edit_patch` which issues **PATCH `/att`** with sub-type `modify` and the diff payload. Non-pushed months keep the existing POST path. Toast: "corrective attendance sent to Razorpay". No UI changes visible unless the operator opens the log.

---

## 6. Statutory column promotion — bundled *(no UI surface change beyond a richer payslip modal)*

Migration adds `pf_amount NUMERIC`, `esi_amount NUMERIC`, `professional_tax NUMERIC` columns to `hr_payslips`. The proxy's payslip importer (line ~305–307 area) is extended to populate them directly from `payroll/view-payroll` response keys (`pf`, `esi`, `professional-tax` and hyphen variants). The existing payslip detail modal renders these columns.

---

## Proxy — new dedicated action branches

`supabase/functions/razorpay-payroll-proxy/index.ts` gains 11 branches:

`payroll_add_addition`, `payroll_add_deduction`, `payroll_do_not_pay`, `payroll_reset_month`, `advance_salary_create`, `contractor_payment_create`, `contractor_payment_delete`, `contractor_payment_list`, `contractor_payment_status`, `attendance_fetch_range`, `attendance_edit_patch`.

Each: validate input with Zod, build `{auth, request:{type,"sub-type"}, data}`, POST/PATCH the correct URL, write a row to `hr_razorpay_pushback_log`, return the parsed body plus a normalized `{ok, error}` envelope. All gated by the matching `hr_razorpay_settings.enable_*_writes` flag.

Enum extension: add the 11 new values to `hr_razorpay_sync_action`.

---

## Files touched

**New (3 components, 0 top-level pages, 0 new routes):**
- `src/components/hrms/employee-profile/PayrollAdjustmentDialog.tsx`
- `src/components/hrms/employee-profile/ContractorPayoutsSection.tsx`
- `src/components/hrms/razorpay/ContractorPayoutsHub.tsx` *(mounted as a tab inside RazorpaySyncPage)*

**Edited:**
- `src/components/hrms/RazorpayPayslipsSection.tsx` — kebab, dialog trigger, `do-not-pay` badge, `paid-on` pill, statutory rows.
- `src/pages/horilla/EmployeeProfilePage.tsx` — mount contractor section + push-advance button on loans row.
- `src/pages/hr/RazorpaySyncPage.tsx` — add Contractor Payouts tab.
- `src/pages/hr/AttendancePeriodLockPage.tsx` — Verify-Razorpay icon + diff popover.
- `src/pages/hr/AttendanceRegularizationPage.tsx` (or shared apply-regularization handler) — reroute to PATCH when already-pushed.
- `supabase/functions/razorpay-payroll-proxy/index.ts` — 11 new action branches + statutory column ingest.

**DB migration:**
- Extend `hr_loans` (`razorpay_advance_salary_id`, `razorpay_pushed_at`).
- Extend `hr_payslips` (`pf_amount`, `esi_amount`, `professional_tax`).
- Create `hr_razorpay_contractor_payments` (+ GRANTs, RLS, trigger).
- Extend `hr_razorpay_sync_action` enum with the 11 new values.

---

## Guardrails preserved

- Every write gated by `hr_razorpay_settings.enable_*_writes` and role permission (`payroll_manage`, `hr_manage_loans`, `hr_manage_users`).
- Contractor delete only when `paid=false`.
- All calls audit to `hr_razorpay_pushback_log`.
- Zero new sidebar entries; the one new surface is a tab inside the existing Razorpay hub.

Build order: 1 → 2 → 6 → 5 → 4 → 3.
