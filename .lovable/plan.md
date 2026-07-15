
# Phase 1a — Deep pull from `people:view`

Live-only tenant confirmed; no sandbox. All work in this phase is **read-only** against Razorpay, so no live-write safeguards trigger yet. Postman JSON is skipped — we discover writable sub-types later, phase-by-phase, as they come up.

## Scope

For every mapped Razorpay employee (currently 40 drafts), fetch the full `people:view` payload, project it into ERP tables, and surface the exact gaps HR must close in the Onboarding Pipeline. Nothing is written back to Razorpay.

## Fetch

- New action `pull_person_full` on `razorpay-payroll-proxy` — JSON-RPC `people:view` with the widest response envelope the endpoint returns (no field cherry-picking on request; we take whatever it gives).
- Batch driver on the client: iterate `hr_razorpay_employee_map` in 20-ID chunks (same chunking that fixed the Edge Function timeout on bulk apply).
- Each fetched envelope is stored raw in a new column `hr_razorpay_employee_map.last_pull_snapshot jsonb` plus `last_pulled_at timestamptz` — canonical audit of what Razorpay actually returned, so future phases don't re-guess field shapes.

## Projection into ERP

Deterministic mapper `projectRazorpayPerson(snapshot)` writes into three tables. Every write is an UPSERT; ERP-authored values that already exist are NEVER overwritten silently — if a field is already set in ERP and Razorpay disagrees, we log the diff into `hr_razorpay_sync_log` and leave the ERP value alone (ERP-wins, per the approved conflict matrix).

| Target table | Fields we attempt to populate (only those actually present in the snapshot) |
|---|---|
| `hr_employees` | first/last name, gender, date_of_birth, personal_email, phone, PAN (identity fields only — never touch is_active from here) |
| `hr_employee_work_info` | date_of_joining, designation, department, employment_type, location, employee_type, reporting_manager (if resolvable to an existing employee) |
| `hr_employee_bank_details` | account_holder_name, account_number, ifsc, bank_name, account_type |

Fields Razorpay does not return stay NULL. No dummy values, no inferred defaults, no manual overrides in the mapper.

## Gap tracking

- Small view `v_razorpay_import_gaps` computes per-draft which of {bank details, PAN, DOJ, department, designation} are still missing.
- `RazorpaySyncPage` gains a "Completion readiness" strip: total drafts, drafts with each gap category, and a click-through into the filtered Onboarding Pipeline. Purely informational; the Onboarding Pipeline itself remains the single activation surface.

## What this phase deliberately does NOT do

- No writes to Razorpay (no `people:update`, no bank push).
- No changes to `is_active` — only the Onboarding Pipeline flips that.
- No auto-merge with existing ERP employees by name/email; mapping stays 1:1 with `hr_razorpay_employee_map`.
- No new permission enums; existing `hrms_razorpay_sync` gates the pull action.

## Safety carry-forwards

- Calls flow through the JWT-gated `razorpay-payroll-proxy`.
- PII-safe logging: `hr_razorpay_sync_log` records field names + hash diffs only; raw PAN/account numbers never leave the snapshot column, which is RLS-locked to Super-Admin + `hrms_razorpay_sync` holders.
- Idempotent: re-running the pull for the same employee is a no-op unless Razorpay's payload changed (compared by SHA-256 of the canonicalised snapshot).

## Verification before phase closes

1. All 40 mapped drafts have a fresh `last_pull_snapshot` and `last_pulled_at`.
2. Every field Razorpay returned that maps to a known ERP column is landed (spot-check 3 drafts against raw snapshot).
3. Gap strip on `RazorpaySyncPage` matches a direct SQL count from `v_razorpay_import_gaps`.
4. `hr_razorpay_sync_log` contains one row per pulled employee with masked field-name list.

## Immediate next phase (proposed, not built yet)

Phase 1b — Onboarding gap-check UI: surface the same gap data inside the Onboarding Pipeline row-by-row and block stage completion when required fields are still empty. Approval on this plan implies Phase 1b is queued next; I will re-plan before starting it.
