
# Razorpay Last-Mile: UI Reachability + Sandbox

Scope is UI reachability only — every proxy action, envelope gate, permission check, and CONFIRM_DISMISS ack stays byte-identical. All new surfaces reuse the existing "why + what unlocks" locked-state component and the canonical `statusVocabulary.ts` labels.

Verified against source: proxy endpointSpec has all 17 actions; `PayrollAdjustmentDialog` exists but is only reachable per payslip row; `ContractorPayoutsHub` + per-employee `ContractorPayoutsSection` exist; `dismissInRazorpay` exists but is only called from `ResignationTab`; no UI caller for `advance_salary_create`; `attendance_fetch_range` exists in proxy but has no verify affordance in `AttendancePeriodLockPage`; proxy `BASE` is hardcoded to `https://payroll.razorpay.com/api`.

---

## Slice 1 — Payroll Month Adjustments hub

**Surface.** New HRMS route `/hrms/payroll/adjustments` (also linked as a station on `RazorpaySyncPage` and from the `PayslipsPage` header). Month picker → roster table of every active/mapped employee for that month.

Each row shows current state read via `payroll_view_payroll` (Gross, Additions, Deductions, LOP, Net, Do-Not-Pay flag) with plain-language labels from `statusVocabulary.ts`. Row actions:
- **Add addition** / **Add deduction** — opens the existing `PayrollAdjustmentDialog` prefilled with employee + month.
- **Pause payroll** / **Resume payroll** — toggles `payroll_do_not_pay`, confirm dialog restates the exact month and employee.
- **Reset modifications** — destructive `AlertDialog` naming every field that will revert.

Bulk-select bar for pause/resume/reset across the roster (each still round-trips per employee inside the same envelope gate). Locked when the payroll envelope isn't verified: renders the standard locked-state card ("Payroll envelope needs re-verification — Settings → Payroll Envelope → Verify" wording pulled from existing dictionary), no silent disabled buttons.

## Slice 2 — Advance Salary flow

**Surface.** New "Push advance to Razorpay" action on the existing Loans tab in the employee profile, and a matching action on the HRMS Loans list (`/hrms/loans`).

Fires `advance_salary_create` with `{amount, description, disburse-on, recovery-months}` derived from the local `hr_loans` row (loan_type='advance'). Result stored back in `hr_loans.razorpay_advance_id` (new nullable column via slice migration) and a "Pushed to Razorpay" chip appears. Payouts-domain envelope gate applies; locked state uses the same plain-words card.

## Slice 3 — Contractor Payments surface polish

Existing hub and profile section already cover create / list / status / delete. This slice only closes gaps: (i) surface the "why + what unlocks" locked card when the payouts envelope is un-verified (currently the create button hides silently); (ii) put the destructive delete behind the standard `AlertDialog` with the payment id + amount in the copy (already partly there — align wording); (iii) add a "Refresh status" bulk action on the hub.

## Slice 4 — people_dismiss on F&F completion

Wire `dismissInRazorpay` into the F&F settlement completion action in `hr_fnf_settlements`, not just resignation. When HR marks F&F as `settled`, show a "Also mark dismissed in Razorpay" `AlertDialog` with the CONFIRM_DISMISS ack pre-checked-off state — user must click through, no auto-fire. Skips silently when the employee has no `razorpay_employee_id`. Salary-envelope gate stays.

## Slice 5 — Attendance verify affordance

On `AttendancePeriodLockPage` add a "Verify with Razorpay" button per locked month that calls `attendance_fetch` for a small sample of employees and shows a diff strip: "N employees match / M differ / K missing on Razorpay". Read-only, no writes. Available to any HR user with `hrms_razorpay_sync`.

## Slice 6 — Sandbox base-URL toggle + commissioning doc

**Doc.** Update `RAZORPAYX_COMMISSIONING.md` §0 to record the sandbox host `https://opfin.np.razorpay.in` and the rehearsal path (verify each envelope against sandbox before flipping to production).

**Toggle.** Add a `razorpay_environment` row to `app_scheduler_secrets` (values: `production` | `sandbox`) plus a Super-Admin-only card on `ExchangeAccountsSettings` / RazorpaySyncPage settings drawer. Proxy reads it once per request and picks `BASE` accordingly.

Guardrails (non-negotiable):
- Flipping the toggle **auto-revokes every envelope verification** (reuses the existing cascade), so sandbox rehearsals can't leak into production unlocks.
- Persistent red banner across every HRMS page + inside every Razorpay-action dialog while sandbox mode is active ("SANDBOX MODE — no real money moves, no production data changes").
- Only Super Admin can flip; change is logged to `system_action_logs`.

Reasoning for building the toggle rather than documenting only: envelope verification is the exact operation that most needs rehearsal, and doing it manually via curl bypasses the same permission/audit trail we're trying to harden. The auto-revoke + banner + Super-Admin gate makes the "mistake sandbox for reality" failure mode implausible.

## Technical details

- **DB.** One migration: `ALTER TABLE hr_loans ADD COLUMN razorpay_advance_id text;` + seed a `razorpay_environment` row into `app_scheduler_secrets`.
- **Proxy.** Read `razorpay_environment` at request entry; `BASE = env === 'sandbox' ? 'https://opfin.np.razorpay.in/api' : 'https://payroll.razorpay.com/api'`. Log the resolved env into `hr_razorpay_sync_log.request_payload.__env` for audit.
- **UI primitives.** New `<RazorpayLockedCard reason="…" unlockPath="…" />` used everywhere a gate blocks an action, replacing today's ad-hoc disabled buttons. New `<SandboxBanner />` mounted at HRMS layout root.
- **No proxy action names, envelope gate logic, CONFIRM_DISMISS handling, or permission checks change.**

## Out of scope

Payroll finalize/run, payslip generation, TDS/compliance docs, bank entry, reimbursements — these have no API surface and remain on the Razorpay dashboard, per owner's stated goal.
