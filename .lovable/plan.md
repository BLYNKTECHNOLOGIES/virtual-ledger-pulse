
# RazorpayX Payroll — Phase 1a kickoff (validation only)

Secrets `RAZORPAY_PAYROLL_KEY_ID` and `RAZORPAY_PAYROLL_KEY_SECRET` are saved. No org id — auth will use HTTP Basic (`key_id:key_secret`) only, matching Razorpay's standard scheme.

This slice does NOT build UI, tables, or the import flow yet. It only proves the base URL + credentials work end-to-end. Nothing gets written to `hr_employees` or Razorpay in this step.

## What gets built now

1. **Edge function `razorpay-payroll-proxy`** (scaffold, single action)
   - Auth: verifies caller JWT + `hrms_razorpay_sync` permission (permission row also gets inserted into `system_functions` as part of this step so the check has something to gate on; Super Admin bypass as usual).
   - Action `validate_creds`:
     - Sends a read-only GET to Razorpay Payroll's employees list endpoint with `page=1&count=1` using Basic auth.
     - Attempts, in order, the two documented base URLs seen in Razorpay Payroll's public API surface, stopping at the first that returns 2xx:
       1. `https://api.razorpay.com/v1/payroll/employees`
       2. `https://payroll.razorpay.com/v1/employees`
     - Returns `{ ok, base_url_used, http_status, sample_employee_count, error_body_snippet }`. On non-2xx it returns the exact status + a short error snippet — no retry, no side effects.
   - Writes a single audit row into `hr_razorpay_sync_log` with action `validate_creds`, http_status, and no PII (payload hash only). If the table doesn't exist yet, logs to function logs only for this call — the full table lands with the Phase 1a migration in the next step.
   - CORS + JSON, standard shape.

2. **One-off invocation from chat** (me, not the UI)
   - I call the function once with `{ action: "validate_creds" }` and paste the result back to you: which base URL worked, HTTP status, and whether the sample list came back.

## What is explicitly NOT in this slice

- No `hr_razorpay_employee_map`, `hr_razorpay_sync_log`, or `hr_razorpay_settings` tables yet — those land with the Phase 1a import migration only after validation passes.
- No import preview UI, no admin page, no drift job.
- No writes to Razorpay.
- No changes to `hr_employees` / `hr_employee_bank_details` / `hr_employee_work_info`.

## Success criteria

- Function returns `ok: true` with a working `base_url_used` and `http_status: 200`.
- Then I come back with the next plan: the Phase 1a migration (three tables + permission wiring) + the import preview UI + the paginated pull. That plan will be presented for approval before any DB or UI work.

## If validation fails

- I stop, surface the exact HTTP status + error body snippet from Razorpay, and we decide together: rotate keys, whitelist a different IP, or contact Razorpay Payroll support. No further build happens until this is green.

## Technical notes

- Basic auth header: `Authorization: Basic base64(key_id:key_secret)`.
- Timeout: 15s per attempt, total 30s.
- No IP whitelisting is configured yet on Razorpay's side; if they enforce it, the first call surfaces a 401/403 with their standard `{ "error": { "code": "...", "description": "..." } }` body and I report the exact text.
- Function is deployed with `verify_jwt = false` in `config.toml` (Lovable default) and enforces auth in code.

Approve this and I'll build the proxy scaffold and run the validation call.
