
# RazorpayX Payroll Integration — Phase 1 (Employee Sync) — Revised

## Guiding principles

- **RazorpayX Payroll is the current system of record** for employees (verified: `hr_employees`=2 rows, `hr_employee_bank_details`=0, `hr_employee_work_info`=2; live payroll roster lives on Razorpay).
- HRMS becomes a **frontend/mirror** — both sides must match structurally so identical inputs produce identical outputs.
- Phase 1 is split: **1a = Razorpay → ERP import (seed)**, then **1b = ERP → Razorpay push (ongoing)**. Payroll runs, payouts, contractors, webhooks stay out of Phase 1.
- Payout stays **manual** later ("Send to Razorpay" button, wired in a later phase).
- Live keys from day one → guardrails (dry-run, per-record confirmation, PII-safe audit log, hard pilot gate, no destructive deletes on Razorpay) are mandatory.

## Phase 1a — Razorpay → ERP import (seed the HRMS)

Since the real roster lives on Razorpay, we import first. The drift-puller from the earlier draft is **promoted to the initial seeder**.

Flow:

```text
Enter live keys (secure form)
   │
   ▼
Read-only GET validation
   │  (list first page of employees; verifies base URL, auth, org id)
   ├─ fail ─► stop, surface exact HTTP status + error body
   ▼
Paginated pull of full Razorpay employee list
   │
   ▼
Preview table in HRMS
   │  columns: name, email, phone, PAN (masked), DOJ, dept, designation,
   │  bank a/c (masked last-4), IFSC, → will create / will update
   │
   ▼
HR confirms  ──►  Upsert into ERP:
     • hr_employees                (get-or-update by razorpay_employee_id in map, else by PAN → email → phone)
     • hr_employee_bank_details    (one row per employee)
     • hr_employee_work_info       (department, designation, DOJ, employment type)
     • hr_departments / hr_positions get-or-created by name (case-insensitive, trimmed)
     • hr_razorpay_employee_map    (razorpay_employee_id, sync_status='imported',
                                    last_synced_at, last_payload_hash)
```

Rules:
- Import is **idempotent** — re-running never duplicates. Map row is the anchor.
- Department / designation resolution is **get-or-create by name**; audit log notes when a new one is minted.
- If a Razorpay employee is missing PAN / bank / IFSC, it still imports but gets flagged `incomplete` on the map; it won't be eligible for 1b push until fixed.
- No writes to Razorpay in Phase 1a.

## Phase 1b — ERP → Razorpay push (ongoing sync)

Enabled only after 1a completes. Enforces **match-before-create**.

Match resolution order for any ERP employee not already mapped:
1. `razorpay_employee_id` in `hr_razorpay_employee_map` (already linked) → **update path**.
2. PAN exact match against Razorpay roster → link as `matched_existing`, **update path only**.
3. Email exact match (case-insensitive) → link as `matched_existing`, **update path only**.
4. Phone (normalized, last-10 digits) → link as `matched_existing`, **update path only**.
5. No match → **create path**, but only via an explicit **"Create new on Razorpay"** confirmation in the dialog (separate button from "Update on Razorpay"). Creation is the exception, never the default.

Every push:
- Runs **dry-run first**: edge fn returns field-level diff + validation errors; HR must confirm before the real POST/PATCH.
- Validates PAN / IFSC / account number regex client + server side.
- Concurrency cap 5, exponential backoff on 429.
- **No delete/archive on Razorpay from ERP** in Phase 1.

### Hard pilot gate (live-keys discipline)

- The **first** ERP → Razorpay push is limited to **exactly one employee**, end-to-end.
- HR must verify the result on the Razorpay dashboard and tick a "Pilot verified" flag (stored in a small settings row / map column).
- Bulk sync drawer stays **disabled** until the pilot flag flips true.
- Enforced server-side in the proxy edge function, not just UI.

## User surface

- **Employees list**: status pill per row — `Imported`, `In sync`, `Drift`, `Error`, `Razorpay-only`, `ERP-only`, `Incomplete`.
- **Employee profile**: "Sync to Razorpay" panel with dry-run diff dialog; separate "Create new on Razorpay" button behind confirmation when no match resolves.
- **Bulk sync drawer** on the list — gated by the pilot flag; shows progress per row with the same diff-then-confirm cycle.
- **Razorpay Sync admin page** (HRMS): credential status, last drift-check run, pilot-gate state, import history, per-employee sync log filter.
- Nightly drift job (existing plan) flags mismatches (badge only, read-only).

## Field mapping (both directions)

Mapped between Razorpay employee ↔ `hr_employees` + `hr_employee_bank_details` + `hr_employee_work_info`:

- name, personal email, personal phone
- date_of_joining, date_of_birth, gender
- department (name), designation, employee_id / badge_id
- PAN, Aadhaar (masked last-4 in UI + logs), address
- bank account number, IFSC, account holder name
- CTC / gross (informational only — no salary-structure sync in Phase 1)

Rows missing any Razorpay-required field surface in a "Not ready to sync" list with the reason. No partial pushes.

## PII-safe audit log

`hr_razorpay_sync_log` **does NOT** store raw request/response bodies. It stores:

- `actor_user_id`, `entity_type`, `entity_id`
- `action` — `validate_creds` | `pull_import` | `pull_drift` | `dry_run` | `push_create` | `push_update`
- `http_status`
- `payload_hash` (sha256 of the outbound body)
- `field_diff_summary` (jsonb): `{ field, before_masked, after_masked, changed }[]`, where PAN / Aadhaar / bank account are **masked to last-4** everywhere before persistence.
- `error_text` (short string only — never the full body).

Full request/response bodies live only in **ephemeral edge function logs** (Supabase functions logs), never in the DB table.

## Tables (single migration)

- `hr_razorpay_employee_map` — `hr_employee_id` (unique), `razorpay_employee_id` (unique), `sync_status` enum (`imported` | `matched_existing` | `in_sync` | `drift` | `error` | `incomplete`), `is_pilot_verified` bool (per-row marker for the pilot employee), `last_synced_at`, `last_payload_hash`, `last_error`, timestamps.
- `hr_razorpay_sync_log` — schema exactly as above (no raw bodies).
- `hr_razorpay_settings` — singleton row: `base_url`, `bulk_sync_unlocked` bool (the hard pilot gate), `last_creds_validated_at`, `last_import_at`.

RLS: authenticated reads gated by permission `hrms_razorpay_sync` (also Super Admin / Admin). All writes only via service_role from the edge function.

## Edge functions

- `razorpay-payroll-proxy` — validates JWT + `hrms_razorpay_sync` permission, performs Razorpay calls, enforces the pilot gate server-side, writes the masked audit log, returns dry-run diff or result. Actions: `validate_creds`, `pull_import`, `dry_run`, `push_create`, `push_update`.
- `razorpay-payroll-drift-check` — pg_cron nightly, paginates Razorpay employees, updates the map.

## Permissions

- New granular permission `hrms_razorpay_sync` inserted into `system_functions`; wired into `usePermissions`. Only Super Admin + explicit grantees can push or import.

## Secrets

Requested via secure form at the start of build:
- `RAZORPAY_PAYROLL_KEY_ID`
- `RAZORPAY_PAYROLL_KEY_SECRET`
- `RAZORPAY_PAYROLL_ORG_ID` (if applicable to your account)

## Base URL

**Not** pre-confirmed — the Postman doc fetch failed. The **read-only GET validation** call in Phase 1a is the gate that confirms base URL + auth + org id. If it fails, we stop and surface the exact HTTP status and error body to you; no UI wiring proceeds until this passes.

## Out of scope this phase

Payroll run push, payout execution, webhooks, contractor/vendor payouts, salary-structure sync, statutory sync (TDS/PF/ESI/PT), Form 16 pull. Roadmap Phases 2–4 from the prior plan stand unchanged.

## What I need from you next

1. Approve this revised plan.
2. In build I will (a) open the secure secret form for the three Razorpay secrets, (b) run the read-only validation GET, (c) surface the result to you before any table/UI work.
