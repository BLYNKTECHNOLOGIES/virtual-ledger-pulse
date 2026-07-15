
# Phase 1a completion — Razorpay → ERP employee import (read-only, pilot-gated)

Goal: finish the one-way pull from RazorpayX Payroll into HRMS without touching any downstream calc surface (payroll engine, salary structures, revisions, PF/ESI, FnF, attendance). Razorpay is the payout system of record for identity + bank; HRMS remains the system of record for structures, attendance, leave, and derived pay.

## Step 0 — Unblock envelope introspection (you)

Open **HR → Razorpay Sync**, click **Validate credentials** then **Introspect envelope**, paste the JSON back. I lock the parser to that exact shape before writing `pull_import`. No code change needed from me until then — this is the pilot gate the plan already agreed to.

If you'd rather skip the manual click: I can add a one-shot `introspect_envelope` log-only call that a Super Admin triggers from the same page (already wired). Recommend using what's there.

## Step 1 — `pull_import` action in `razorpay-payroll-proxy`

Paginated GET against `https://payroll.razorpay.com/v1/employees` using `page`/`count` (or the pagination fields discovered in Step 0). Per employee:

- **Match ladder** (first hit wins, all case/space-normalised):
  1. `hr_razorpay_employee_map.razorpay_employee_id`
  2. `hr_employees.pan_number` (exact, uppercased)
  3. normalised phone (last 10 digits) against `hr_employees.phone`
  4. no match → **create** new `hr_employees` row
- **Get-or-create** department and position by trimmed CI name (never mutate existing rows' names).
- **Bank details** upsert into `hr_employee_bank_details` keyed on `hr_employee_id` — only overwrite when Razorpay value is non-empty AND differs; never null-out an existing value.
- **Work info** into `hr_employee_work_info` — same non-destructive merge.
- **Incomplete guard**: if PAN missing OR bank IFSC/account missing → row imported with `sync_status='incomplete'`, `last_error` explaining which field, still surfaced in preview but flagged.

Idempotency: SHA-256 hash of the canonical Razorpay payload stored in `last_payload_hash`; re-runs that hash-match skip the write entirely and only bump `last_synced_at`.

## Step 2 — HRMS calc-integrity guardrails (the piece I want to add proactively)

Because HRMS payroll math (`salaryComputation.ts`, `hr_employee_salary_structures`, `hr_salary_revisions`, `hr_payroll_runs`, `hr_payslips`, PF/ESI in `statutoryReports.ts`, FnF) all reads from `hr_employees` + bank + work info, an import that silently changes a field mid-cycle can corrupt a payroll run. Guardrails:

- **Payroll-lock window**: `pull_import` refuses to modify an employee row whose `hr_employee_id` appears in a `hr_payroll_runs` row with status `draft`/`processing`/`approved` for the current month. Returns `sync_status='deferred_payroll_locked'` and surfaces it in the preview.
- **Salary field firewall**: import NEVER writes to `basic_salary`, `total_salary`, `hr_employee_salary_structures`, or `hr_salary_revisions`. Salary in Razorpay is treated as reference-only and logged into `hr_razorpay_sync_log.field_diff_summary` as a masked drift signal (`total_salary: ****→****`) — never applied. Revisions continue to flow exclusively through `ReviseSalaryDialog` → `hr_salary_revisions`.
- **PF/UAN/ESI numbers**: imported into `hr_employees` only when currently NULL. If Razorpay differs from a stored non-null value → flag as `drift`, don't overwrite. Prevents breaking ECR/ESI file generation mid-quarter.
- **PAN mutation guard**: PAN never overwritten once set — PAN drift → `drift` status, manual reconciliation via a Resolve dialog (Step 4).
- **Phone/email**: overwrite allowed only if empty; conflicts → `drift`. Respects the client-side "email removal" rule for staff too (we don't collect via this import if Razorpay omits it).
- **Departments/positions**: create-only, never rename existing.

Every skip/defer emits a PII-safe log row (`payload_hash`, masked `field_diff_summary`, reason).

## Step 3 — Preview & confirm UI (HR → Razorpay Sync page)

Extend `RazorpaySyncPage`:

1. **Dry-run** button → calls `pull_import` with `dry_run=true`, no writes. Result cached server-side (hash keyed) for 10 min so Confirm applies the same diff.
2. **Summary strip**: total Razorpay employees, `will_create`, `will_update`, `incomplete`, `deferred_payroll_locked`, `drift`. The total is the sanity check against your known headcount.
3. **Per-row table**: name, Razorpay ID, match rule that fired, action pill, sensitive fields masked to last-4 (`PAN: ****1234`, `A/C: ****5678`).
4. **Confirm import** disabled until dry-run runs. Runs `pull_import` with `dry_run=false`, shows result summary, updates `last_import_at`.
5. **Pilot gate**: `bulk_sync_unlocked=false` caps the confirm run at 1 row unless a Super Admin flips the toggle in the same page. Toggle change is logged.

## Step 4 — Status pills on Employee list

`hr_razorpay_employee_map.sync_status` surfaced on `EmployeeListPage` as a small badge column (Imported / In sync / Incomplete / Drift / Payroll-locked / ERP-only). Clicking a Drift badge opens a right-side **Resolve** panel showing masked field diffs and two buttons: "Keep ERP value" (writes `is_pilot_verified=true`, ignores Razorpay for that field going forward) or "Adopt Razorpay value" (writes to ERP, respects the firewall — salary fields stay disabled). All resolutions logged.

## Step 5 — Verify & typecheck

- Run `validate_creds` + `pull_import(dry_run=true, limit=1)` end-to-end against 1 pilot employee.
- Confirm no `hr_payroll_runs`, `hr_salary_revisions`, or `hr_employee_salary_structures` row is touched.
- `tsgo` typecheck clean.
- Explicit report: rows imported, rows deferred, rows drifted, zero Razorpay writes, no raw PII in logs.

## Explicit non-goals (Phase 1a)

- No writes to Razorpay (that's Phase 1b).
- No auto-triggered imports (manual only, HR-initiated).
- No salary/structure/revision changes from this pipeline — ever.
- No touching payroll runs, payslips, PF/ESI files, FnF, attendance, leave.

## Suggestions for your consideration

1. **Nightly drift job** (Phase 1c candidate): read-only pull that only writes to `hr_razorpay_sync_log` with masked diffs — gives you a daily "what changed on Razorpay" report without any ERP mutation. Cheap, high signal.
2. **Payroll-cycle lock alignment**: adopt a convention that Razorpay edits happen only between the 26th of month M and the 1st of M+1 (pre-payroll window). The lock in Step 2 enforces this automatically once payroll runs are opened.
3. **Two-key sensitive edits**: for Drift resolution on PAN/UAN/bank A/C, require the same maker-checker split used in shift reconciliation v2 — one HR proposes, another approves. Reuses your existing pattern, zero new UX.
4. **Deprecation path for parallel data entry**: once Phase 1b lands, block manual edits to PAN/UAN/ESI/bank fields in `EmployeeProfilePage` — force those through Razorpay so drift can't reappear. Ship this as a permission flag, not a hard removal.

Approve and I'll start with Step 1 (`pull_import` scaffold + payload-hash idempotency) as soon as you paste the envelope shape.
