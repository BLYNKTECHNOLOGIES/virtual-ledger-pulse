# Phase 7 — Payroll-Run Orchestration

Goal: orchestrate a full monthly payroll cycle against RazorpayX from the ERP — compute → preview → finalize → lock — while keeping every write hard-gated behind endpoint verification and a human pilot, matching the discipline established in Phases 3–6.

## Scope (this phase)

In: Payroll run lifecycle (create → compute → review → finalize → lock), CTC + attendance/LOP composition into gross/net, dry-run preview against RazorpayX, endpoint-verified apply, per-employee skip labels, period immutability, recall-with-reason.

Out (later phases): actual disbursement/payouts (Phase 8), payslip PDF ingest (Phase 9), ledger reconciliation (Phase 10).

## Sources of truth

- CTC + components: `hr_employee_salary_structures` + `hr_salary_components` (ERP-truth, already in use for salary push).
- Attendance / LOP: month roll-up from Phase 6 (`working_days`, `present_days`, `paid_leave_days`, `lop_days`).
- Deductions/loans: `hr_loans` + `hr_loan_repayments` outstanding EMI due for the period.
- Reimbursements/one-offs: `hr_salary_revisions` effective in period (already applied to structure) + explicit "one-off" line items entered on the run (this phase adds a small entry table).

No new "shadow" salary math — Phase 7 assembles rows from existing structures; it does not invent numbers.

## Data model (migration)

```text
hr_razorpay_payroll_runs           one row per (period_month, exchange_scope)
  period_month DATE (1st of month), status ENUM
    draft | computed | dry_run_ok | pilot_applied | bulk_applied | locked | recalled
  totals_gross, totals_deductions, totals_net (numeric, computed)
  envelope_verified BOOL, envelope_verified_by UUID, envelope_verified_at
  dry_run_response JSONB, apply_response JSONB
  locked_at, locked_by, recall_reason, recalled_by, recalled_at
  created_by, created_at, updated_at

hr_razorpay_payroll_run_lines      one row per (run_id, employee_id)
  gross_earnings, lop_amount, other_deductions, loan_emi,
  net_pay, skip_label TEXT NULL       -- 'no_structure' | 'no_attendance'
                                      -- | 'no_bank' | 'no_pan' | 'terminated'
  source_snapshot JSONB               -- freeze of structure+attendance used
  push_status ENUM draft|dry_run_ok|applied|failed|skipped
  push_response JSONB, applied_at

hr_razorpay_payroll_run_one_offs   optional per-line adjustments
  run_id, employee_id, kind (bonus|reimbursement|deduction), amount, note

Unique indexes:
  (period_month) on hr_razorpay_payroll_runs
  (run_id, employee_id) on lines

RLS: hrms_razorpay_sync permission (existing) for select/insert/update.
GRANT authenticated (select/insert/update/delete), service_role ALL.
```

Settings additions on `hr_razorpay_settings`:
- `push_payroll_envelope_key TEXT` (verified probe response key, e.g. `payroll_run:apply`)
- `push_payroll_endpoint_verified BOOL`
- `push_payroll_envelope_verified_by UUID`
- `push_payroll_pilot_unlocked BOOL`, `push_payroll_bulk_unlocked BOOL` (independent from Phase 5/6 gates)

## Proxy actions (razorpay-payroll-proxy)

All hard-gated server-side on `push_payroll_endpoint_verified=true` for any write action.

- `probe_payroll_run` — GET on RazorpayX payroll list/run endpoint, records raw envelope for human eyeball.
- `compute_payroll_run { period_month }` — pure ERP: builds lines from structures + Phase 6 attendance roll-up + due EMIs; no external call. Emits skip labels for `no_structure`, `no_attendance`, `no_bank`, `no_pan`. Idempotent per period (upserts lines).
- `dry_run_payroll_run { run_id }` — POSTs computed payload with `dry_run: true` (or provider equivalent); stores response; flips status to `dry_run_ok` on success.
- `apply_payroll_pilot { run_id, employee_ids[] }` — requires `pilot_unlocked`; applies for 1–3 named employees; NEVER flips bulk_unlock.
- `apply_payroll_bulk { run_id }` — requires `bulk_unlocked` AND `dry_run_ok`; applies remaining lines.
- `lock_payroll_period { run_id }` — flips status to `locked`; blocks any further apply/recompute.
- `recall_payroll_period { run_id, reason }` — same discipline as Phase 6 attendance recall: mandatory reason, actor logged, moves status back to `dry_run_ok`, does not delete history.

Server-side hard-blocks (reject with clear error):
- Any write while `push_payroll_endpoint_verified=false`.
- `apply_payroll_bulk` while `push_payroll_bulk_unlocked=false`.
- Any compute/dry-run/apply on a `locked` period without prior recall.
- Attendance period for the same month not yet finalized (Phase 6 gate) → refuse compute.

## UI — RazorpaySyncPage: "Payroll Run" tab

- Month picker (defaults to previous month, capped by `today - 1 day`).
- Card 1 — Preflight: shows attendance-finalized badge, endpoint-verified badge, unlock states. All writes disabled until greens.
- Card 2 — Compute: `Compute run` button → table of lines with sortable columns (badge, name, gross, LOP, deductions, net, skip label). Filter chips for each skip label. Totals footer.
- Card 3 — Dry run: `Run dry-run` → shows RazorpayX preview response side-by-side with ERP net; highlights any mismatch > ₹1.
- Card 4 — Pilot: employee multi-select (2–3 max), `Apply pilot` (audit-logged). Result table with success/fail per line.
- Card 5 — Bulk apply: enabled only after `bulk_unlocked` toggled by a Super Admin AND `dry_run_ok`. Confirmation dialog with total headcount + net amount.
- Card 6 — Lock / Recall: `Lock period` after bulk_applied; `Recall` requires reason textarea (min 12 chars) and logs actor.

Reuses existing `RazorpaySyncPage` shell + design tokens; no new palettes.

## Skip-label semantics (labeled no-op, not silent)

Every line without complete inputs is emitted with `push_status='skipped'` and a `skip_label`. Skipped lines never hit RazorpayX. UI surfaces them in a dedicated "Not pushed" section with per-label counts, matching Phase 3/6 discipline.

## Audit & idempotency

- Every proxy write appends to `hr_razorpay_sync_log` (existing) with action, run_id, actor, employee_ids, response summary.
- `apply_*` is idempotent per (run_id, employee_id): re-apply on a line already `applied` returns the stored `push_response`, no external call.
- `recall_*` writes an audit row before flipping status.

## Verification checklist before shipping

1. Compute produces correct net for a hand-picked employee (structure + full attendance).
2. LOP-only employee produces LOP-labeled deduction, not a skip.
3. Employee with no structure OR no bank OR no PAN produces `skipped` + label.
4. Locked period rejects all writes with a clear error.
5. Recall requires reason, is audit-logged, and reverts to `dry_run_ok`.
6. Bulk-apply refuses without `bulk_unlocked=true`.
7. Any write with `endpoint_verified=false` returns 4xx server-side (not just UI-hidden).

## Deliverables

- 1 migration (tables + settings columns + RLS + grants).
- Update `supabase/functions/razorpay-payroll-proxy/index.ts` with 7 new actions.
- New `PayrollRunTab.tsx` under `src/components/hrms/razorpay/` + wire into `RazorpaySyncPage.tsx`.
- Sync log entries for every write; UI viewer already exists.

## Not doing in this phase

- Real disbursement (that's Phase 8).
- Editing salary structure from this screen (goes through existing Salary Revision flow).
- Cross-month back-adjustments (must go through a fresh run on a new period, or Phase 10 reconciliation).

Ready to implement on approval.
