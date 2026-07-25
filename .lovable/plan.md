# Universal RazorpayX push verification

## Goal
Every RazorpayX write (identity, bank, employment, salary, statutory, dismissal, and future kinds) must be treated as **not finalized** until HRMS re-reads the same fields from RazorpayX and confirms every changed field matches. When any field doesn't match, an "Update result" dialog opens showing exactly what was updated, what wasn't, and why — with a per-field retry.

Today only salary has strict verification, and even that is based on the proxy's own response (`erp_total`), not a re-fetch. Identity/bank/employment/statutory/dismissal pushes all currently toast "success" whenever RazorpayX returns 200, even though RazorpayX silently no-ops several fields (bank IFSC updates, phone updates, probation date, and dismissal are all famous for this).

## Deliverables

### 1. Proxy: single verification endpoint (`verify_push`)
New action `verify_push` in `supabase/functions/razorpay-payroll-proxy/index.ts` that takes `{ kind, razorpay_employee_id, expected }` and returns `{ fields: [{ key, expected, actual, match, reason? }], overall: "verified" | "partial" | "failed" }`.

Per-kind field maps (extracted from existing snapshot normalization in `read_person_by_id` and `edit_person_by_id`):

- `identity` → `first_name, last_name, email, phone, gender, date_of_birth, pan_number, aadhaar_last4`
- `bank` → `bank_account_number, ifsc, account_holder_name`
- `employment` → `date_of_joining, probation_end_date, department, designation, employee_type, work_location`
- `salary` → `annual_ctc` (from `__salary.annual_ctc` when payroll has executed) + optional component sum
- `statutory` → `pf_enabled, esi_enabled, pt_enabled` (parsed from people:view enrollment block)
- `dismissal` → `employment_status ∈ {dismissed}, date_of_dismissal`

Normalization: dates → `YYYY-MM-DD`, phone → last-10, IFSC → upper, booleans → strict `true/false`, numbers → ±₹1 tolerance. Never string-compare raw payloads.

For salary specifically, `annual_ctc` is only exposed by `payroll:view-payroll` after an executed run. When unavailable, the field is reported as `match: null` with `reason: "not exposed until first payroll run"`, and we fall back to the proxy's echoed `erp_total` (same behavior we have now). The dialog surfaces this honestly rather than falsely claiming verification.

### 2. Client: `pushWithVerification` (single entry point)
Replace the current `pushToRazorpay` internals so every kind runs the same shape:

```text
push → wait 800ms (Razorpay eventual-consistency) → verify_push → return { ok, diff, overall }
```

Return type:
```ts
{
  ok: boolean;              // true only when overall === "verified"
  overall: "verified" | "partial" | "failed" | "skipped";
  diff: FieldDiff[];        // always populated, even on success
  error?: string;
  razorpayEmployeeId?: string;
}
```

`pushIdentity/Bank/Salary/Employment/Statutory/Dismissal` become thin wrappers that pass the correct `kind` + `expected` snapshot built from the ERP row that was just written.

The log row in `hr_razorpay_pushback_log` records the diff JSON in `response_snapshot` (already the column we use). `hr_drift_alerts` is only opened when `overall !== "verified"` and lists the mismatched field names in `resolution_note`.

### 3. UI: `RazorpayPushResultDialog`
New shared component `src/components/hrms/RazorpayPushResultDialog.tsx`. Opens automatically from a top-level provider whenever a push resolves to `partial` or `failed`. Shows:

- Employee name + RazorpayX employee-id
- Push kind and timestamp
- Two lists rendered from `diff`:
  - "Confirmed by RazorpayX" — green rows with expected value
  - "Not applied by RazorpayX" — amber/red rows with expected vs actual and reason (`"RazorpayX still shows old value"`, `"field not readable until first payroll run"`, `"RazorpayX rejected: <error>"`)
- Buttons: **Retry push**, **Open in RazorpayX** (deeplink), **Dismiss** (records "acknowledged" in drift alert)
- On `verified`, we just toast — no dialog interruption for the happy path.

A provider `RazorpayPushFeedbackProvider` mounted in `HorillaLayout.tsx` owns the dialog state; any push call inside the HRMS tree can raise a result via a small `useRazorpayPushFeedback()` hook. This keeps every caller a two-liner: `const push = useRazorpayPushFeedback(); await push.salary(employeeId, expected);`

### 4. Wire callers
- `ReviseSalaryDialog.tsx` — replace current bespoke flow with the hook.
- `SalaryRevisionsPage.tsx` per-row retry — replace with hook.
- `Stage5Finalization.tsx` reconciliation pushes — replace three separate identity/bank/employment invokes.
- `EmployeeProfilePage.tsx` bank + identity edit forms.
- `SeparationDialog` (dismissal path) and `EnrollmentToggleRow` (statutory) — same.

Direct `supabase.functions.invoke("razorpay-payroll-proxy", …)` calls that write and don't verify are grepped and either routed through the hook or explicitly flagged as read-only.

## Non-goals for this pass
- Bulk operations (Salary Register import, bulk statutory) keep their existing dry-run + bulk-summary UI; they'll get a per-row diff column but no modal-per-row.
- No new "confidence score" or automatic auto-retry. Retry is always user-triggered.
- No schema changes — `hr_razorpay_pushback_log.response_snapshot` and `hr_drift_alerts.resolution_note` already carry what we need.

## Technical notes

- Read-back delay: RazorpayX's people:view is eventually consistent for a few hundred ms after a write. We wait 800ms once, then verify. If `overall !== "verified"` on the first probe, we re-verify once at +2s before opening the failure dialog to avoid false negatives.
- Salary CTC: proxy already probes executed-run months in `read_person_by_id`. For a brand-new hire with no run yet, salary verification reports `annual_ctc: { match: null, reason: "not exposed until first payroll run" }` and uses the proxy's echoed `erp_total` as an interim "structure written" signal. The dialog is explicit about this instead of pretending it's verified.
- Statutory: proxy already normalizes enrollment; extend `read_person_by_id` to attach `__statutory: { pf_enabled, esi_enabled, pt_enabled }` parsed from the same people:view body.
- Dismissal: `isDismissedRazorpayPerson()` already exists; expose the parsed date in `__dismissal: { dismissed, date_of_dismissal }`.
- Fields RazorpayX genuinely does not expose (e.g. some tenants hide PAN in view) are reported as `match: null, reason: "not exposed"` — never as a false success.

## File touch list

- `supabase/functions/razorpay-payroll-proxy/index.ts` — add `verify_push` action; extend `read_person_by_id` snapshot with `__statutory`, `__dismissal`.
- `src/lib/razorpayPushback.ts` — refactor to `pushWithVerification`; keep the old exported names as wrappers.
- `src/components/hrms/RazorpayPushResultDialog.tsx` — new.
- `src/components/hrms/RazorpayPushFeedbackProvider.tsx` — new provider + hook.
- `src/pages/horilla/HorillaLayout.tsx` — mount provider.
- `src/components/hrms/ReviseSalaryDialog.tsx`, `src/pages/horilla/SalaryRevisionsPage.tsx`, `src/pages/horilla/onboarding/Stage5Finalization.tsx`, `src/pages/horilla/EmployeeProfilePage.tsx`, `src/components/hrms/SeparationDialog.tsx`, `src/pages/horilla/settings/StatutoryEnrollmentPage.tsx` (or wherever the statutory toggle lives) — swap to hook.

No database migration is required.
