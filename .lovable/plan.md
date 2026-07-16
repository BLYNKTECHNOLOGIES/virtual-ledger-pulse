## Goal

Bring `razorpay-payroll-proxy` and its probe UI into exact alignment with the RazorpayX Payroll (Opfin) Postman collection you provided. Fix the wrong sub-types / paths we're currently calling, drop the ghost endpoint, and expose the 12 real endpoints we never wired.

## The 18 real endpoints (source of truth from your Postman JSON)

```text
POST /api/people             people/create, people/edit, people/view, people/set-salary, people/dismiss
POST /api/payroll            payroll/view-payroll, payroll/add-additions, payroll/add-deduction,
                             payroll/reset-modifications, payroll/do-not-pay
POST /api/contractorPayment  contractor-payment/create, contractor-payment/delete,
                             contractor-payment/list-pending, contractor-payment/get-status
POST /api/att                attendance/modify, attendance/fetch
PATCH /api/att               attendance/modify
POST /api/advanceSalary      advance-salary/create
```

Everything else our proxy currently references (`people/update`, `attendance/update`, `payroll/run`, `payouts/view`, `salary-structure/*`, `payslip/*`, `tds/*`, `webhook/*`, `bank-details/view`) does not exist in the Opfin API.

## Changes

### 1. Fix wrong sub-types / paths (in place, no UI change)
- `people/update` → `people/edit` (three call sites in the proxy).
- Attendance default envelope `attendance/update` on `/api/attendance` → `attendance/modify` on `/api/att`. Operator-set envelope override is preserved but normalized to the doc's path when the sub-type is `modify`.

### 2. Drop the ghost `payouts/view` endpoint
Phase 8 `pull_payouts` currently calls `POST /api/payouts` — that URL is not in the doc. Rewire it to:
- Employees → `payroll/view-payroll` for the target period (returns per-employee net + payout status).
- Contractors (future) → `contractor-payment/get-status`.

No DB schema change. Existing `hr_razorpay_payout_records` rows keep their meaning; only the fetch source changes.

### 3. Rewrite the probe catalogue to the 18 real endpoints
- `probe_endpoint` READONLY allowlist replaced with only endpoints that have a real read variant: `people/view`, `payroll/view-payroll`, `contractor-payment/list-pending`, `contractor-payment/get-status`, `attendance/fetch`.
- `probe_catalogue` CATALOGUE replaced with the 18-row matrix above, phased as:
  - Phase 1 — Import: `people/view`
  - Phase 3 — Master push: `people/create`, `people/edit`
  - Phase 5 — Salary: `people/set-salary`
  - Phase 6 — Attendance: `attendance/fetch` (read), `attendance/modify` (write)
  - Phase 7 — Payroll: `payroll/view-payroll` (read), plus `add-additions`, `add-deduction`, `reset-modifications`, `do-not-pay` (writes, not_probed)
  - Phase 8 — Payout: `payroll/view-payroll` (read reuse), `contractor-payment/get-status` (read)
  - Phase 9 — Separation: `people/dismiss` (write)
  - Contractor Payments (new panel in Advanced view): all 4 sub-types
  - Advance Salary (new panel): `advance-salary/create` (write)
- Everything else previously listed (`salary-structure:*`, `payslip:*`, `tds:*`, `webhook:*`, `bank-details:view`, `people:list`) is removed — those were the "fails" HR was seeing.

### 4. Expose the 12 missing actions

Add these top-level proxy actions, each a thin wrapper that hits the correct path with the correct sub-type and validates gates (endpoint-verified where applicable):

```text
people_create              people/create           gated: identity endpoint verified
people_dismiss             people/dismiss          gated: identity endpoint verified + explicit ack
payroll_view               payroll/view-payroll    read, no gate
payroll_add_additions      payroll/add-additions   gated: payroll endpoint verified
payroll_add_deduction      payroll/add-deduction   gated: payroll endpoint verified
payroll_reset_modifications payroll/reset-modifications gated: payroll endpoint verified
payroll_do_not_pay         payroll/do-not-pay      gated: payroll endpoint verified
contractor_payment_create  contractor-payment/create gated: payout endpoint verified
contractor_payment_delete  contractor-payment/delete gated: payout endpoint verified
contractor_payment_list_pending contractor-payment/list-pending read, no gate
contractor_payment_status  contractor-payment/get-status read, no gate
advance_salary_create      advance-salary/create   gated: payroll endpoint verified
attendance_fetch           attendance/fetch        read, no gate
```

Every write action appends a row to `hr_razorpay_sync_log` (existing table) with actor, action, target IDs, and response summary — same discipline as the existing writes.

### 5. UI

- Simple view: no visible change (still Check / Test one / Import everyone).
- Advanced view: probe catalogue now shows the 18 endpoints only; the "many fails" you were seeing disappear because the ghost sub-types are gone. No new tabs are added in this pass — the 12 new actions are available via the proxy for follow-up UI phases (contractor payments panel, advance salary panel).

## Not in this pass

- No new UI panels for contractor payments / advance salary / payroll modifications — that's a follow-up once you decide which HR roles operate them.
- No DB schema changes.
- No behavioral change to Phases 1–6 for existing verified envelopes — only defaults and wrong sub-types are corrected.

## Verification

- `probe_catalogue` returns 18 rows, no `[object Object]` errors, no 404s for reads that exist.
- `people/edit` (the corrected identity write) passes envelope verification for a pilot employee.
- `pull_payouts` reads from `payroll/view-payroll` for the current month without touching the ghost path.
- Existing verified envelopes on the DB remain valid; anything using the wrong sub-type is auto-migrated on save.

Approve and I'll implement in one pass.
