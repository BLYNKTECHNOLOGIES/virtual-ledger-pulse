# RazorpayX ↔ HRMS Integration — Phase 2+ Plan

## Grounding facts (current system)

- **ERP is the payroll engine, not Razorpay.** `fn_generate_payroll` computes attendance/LOP, penalties, loan EMIs, deposit deductions, EPF cap (₹1,800), and TDS in one Postgres function, writing `hr_payslips` and updating `hr_loan_repayments`/`hr_deposit_transactions`. Razorpay computes nothing today.
- **Existing integration is one-way pull.** `razorpay-payroll-proxy` supports `validate_creds`, `fetch_one`, `apply_one`, `unlock_bulk`, `probe_endpoint`, `dry_run_range`, `apply_range`, `pull_person_full`. No write action exists. Enum values `push_create` / `push_update` are reserved but unused.
- **Salary revisions are ERP-local.** `apply_salary_revision` RPC + `apply_due_scheduled_salary_revisions()` promoter mutate `hr_employees.basic_salary/total_salary` directly. Nothing reaches Razorpay.
- **Exit flow is ERP-local.** ResignationTab → `hr_employees.last_working_day` → FnFSettlementPage → `is_active=false`. No dismiss push to Razorpay.
- **Tenant is Live-only.** No sandbox — every probe/write must be idempotent and reversible.

## Design principle

**ERP is the system of record. Razorpay is the payout & statutory-filing rail.** Data flows outward from ERP to Razorpay only when a payout-adjacent trigger fires (new hire completed, salary changed, resigned, monthly payroll run finalized). Razorpay-side edits are never treated as authoritative; nightly drift walks report differences and default to ERP-wins.

## Phase map

```text
Phase 1  (DONE)  Import + deep-pull, ERP-wins projection, gap dashboard
Phase 2          Probe & envelope catalogue for every write-capable sub-type
Phase 3          Employee-master write (people:update) with pilot-one gate
Phase 4          Bank-details & PAN write path (highest payout-risk domain)
Phase 5          Salary-structure sync (component mapping, structure push)
Phase 6          Monthly attendance/LOP push (payroll-cycle input)
Phase 7          Payroll-run orchestration (execute/status/finalize)
Phase 8          Payslip & TDS pull-back to Storage
Phase 9          Separation push (dismiss) + FnF close
Phase 10         Webhook ingestion + nightly drift reconciliation
```

Each phase is gated: no UI, DB writes, or edge-fn write action until a `probe_endpoint` call for its sub-type returns a documented envelope, captured in `hr_razorpay_sync_log`.

---

## Phase 2 — Probe & envelope catalogue

**Goal:** Prove which JSON-RPC sub-types this Live tenant actually accepts, before designing any push.

**Actions in `razorpay-payroll-proxy`:**
- Extend `probe_endpoint` allowlist to include reserved write sub-types in a **dry-header-only** mode: `people:create`, `people:update`, `people:dismiss`, `salary-structure:create`, `salary-structure:update`, `salary:update`, `attendance:import`, `payroll:execute`, `payroll:finalize`, `payslip:view`, `payslip:download`, `tds:view`.
- Each probe sends the smallest legal envelope for `type=validate` where the API supports it, otherwise a read variant of the same resource (e.g. `people:view` on the pilot map row) to confirm the resource path exists and the API key has the scope.
- Record every probe in `hr_razorpay_sync_log` with `action='drift_check'`, `field_diff_summary={sub_type, http_status, has_error, error_class}`, no PII.

**Deliverable:** a probe-results table in `RazorpaySyncPage` showing green/red per sub-type. No phase past 2 is buildable for sub-types marked red.

**Guardrails:** probes hit the pilot-verified employee only (one ID). No range/loop probing.

---

## Phase 3 — Employee-master push (`people:update`)

Trigger: ERP edit on `hr_employees` (identity: name, phone, gender, dob, pan_number, uan_number, esi_number) or `hr_employee_work_info` (department, job_position, joining_date, reporting_manager) commits.

**Mechanics:**
- New DB trigger `trg_queue_razorpay_master_push` on `hr_employees` / `hr_employee_work_info` inserts into new table `hr_razorpay_push_queue` (`hr_employee_id, domain, patch_hash, status, attempts, last_error`).
- New proxy action `flush_master_push`: dequeues, canonicalises the patch, drops fields with the same `payload_hash` already recorded (no-op skip), POSTs `people:update`, logs to `hr_razorpay_sync_log` with `action='push_update'`.
- Only rows where `hr_razorpay_employee_map.is_pilot_verified=true` AND `hr_razorpay_settings.bulk_sync_unlocked=true` are flushed; others sit in queue.
- Per-domain toggle in `hr_razorpay_settings` (new booleans `push_identity_enabled`, `push_work_info_enabled`, `push_bank_enabled`, `push_salary_enabled`) — every push respects its toggle.

**Pilot-one gate:** first flush must target exactly one queued row (`apply_one`-style), operator confirms in UI, only then the queue is cleared for the rest.

---

## Phase 4 — Bank & PAN write

Highest-blast-radius domain (wrong account = wrong payout). Isolated as its own phase behind its own toggle.

- `hr_employee_bank_details` inserts/updates enqueue a `domain='bank'` push.
- Precondition: PAN present on `hr_employees` and IFSC/account passes format checks in a new SQL function `validate_bank_details()`.
- UI shows a diff-and-confirm dialog for every bank push (no silent flush), even after bulk unlock.

---

## Phase 5 — Salary-structure sync

**Blocker to resolve first:** map ERP `hr_salary_components.code` → Razorpay component IDs. No mapping exists today.

- New table `hr_razorpay_component_map` (`hr_component_id, razorpay_component_key, is_active`).
- `RazorpaySyncPage` gains a "Component mapping" tab that fetches Razorpay's structure catalogue via `salary-structure:view` and lets an operator hand-pair components.
- `hr_employee_salary_structures` changes enqueue a `domain='salary_structure'` push using the map.
- `apply_salary_revision` gains an optional `p_push_to_razorpay boolean default false`; when true and the employee is bulk-unlocked with `push_salary_enabled`, the revision commit enqueues a push.

---

## Phase 6 — Monthly attendance / LOP push

Trigger: `hr_payroll_runs.status` transitions to `LOP_LOCKED` (new state before `PROCESSING`).

- New proxy action `push_attendance(payroll_run_id)`: for every payslip row in that run, POST `attendance:import` with `{employee_id, present_days, lop_days, working_days, overtime_hours}` from `hr_payslips`.
- Idempotency key: `(razorpay_employee_id, pay_period_start, pay_period_end)`; retries safe.
- Response ingested into `hr_payroll_runs.additional_info.razorpay_attendance_ack`.

---

## Phase 7 — Payroll-run orchestration

Once attendance is pushed, ERP asks Razorpay to execute payout for the same pay period.

- Actions: `payroll_execute(payroll_run_id)`, `payroll_status(payroll_run_id)`, `payroll_finalize(payroll_run_id)`.
- Status polls populate `hr_payroll_runs.status`: `SENT_TO_RAZORPAY → PROCESSING → PAID → FAILED`.
- ERP payslip amounts remain authoritative; Razorpay is asked to disburse `net_salary` and to handle statutory filings (EPF/ESI/TDS). Any diff on Razorpay's echoed net beyond ₹1 raises a `drift` sync log and blocks finalize.

---

## Phase 8 — Payslip & TDS pull-back

- Nightly cron: for each `hr_payroll_runs.status='PAID'` row, call `payslip:download` per employee and `tds:view` per PAN.
- Persist PDFs to Supabase Storage bucket `razorpay-payslips/{payroll_run_id}/{badge_id}.pdf` (private, RLS to owner + payroll admins).
- Write `hr_payslips.payment_reference` from Razorpay's payout id.

---

## Phase 9 — Separation push

- `hr_employees.last_working_day` set + `is_active=false` triggers `domain='dismiss'` push (`people:dismiss` or equivalent — validated in Phase 2 probe).
- FnF settlement close only allowed after dismiss push acknowledges.

---

## Phase 10 — Webhook + drift reconciliation

- Public endpoint `razorpay-webhook` (JWT-verified via Razorpay's HMAC secret stored via `add_secret`) receives status updates and Razorpay-side edits.
- Any Razorpay-originated edit writes to `hr_razorpay_push_queue` with `domain='razorpay_edit'` for operator review — never auto-applied.
- Nightly `drift_walk` action re-pulls `people:view` for every mapped row, diffs against ERP, logs field-level drift (names only, no PII).

---

## Cross-cutting safety

- **JWT gate** on every write action (already applied on proxy — extend to new actions).
- **Payload hash no-op skip** on every push (avoid duplicate API calls, avoid rate-limit burn).
- **Per-domain toggles** in `hr_razorpay_settings` default OFF; each phase ships with its toggle off, activated only after pilot-one succeeds.
- **PII discipline**: `hr_razorpay_sync_log.field_diff_summary` stores field names + hashes only, never values.
- **No mass writes without a pilot-one** gate — extend the existing `unlock_bulk` pattern to every new domain.
- **Rate limiting**: chunk every bulk push in groups of 15 with 500 ms spacing (matches the 30 s edge-fn budget we already established for `pull_person_full`).

## Technical notes for engineers

- All new proxy actions follow the JSON-RPC envelope `{ type: <action>, "sub-type": <sub_type>, data: {...} }` on `POST /api/{resource}`; no REST verbs.
- Every new DB table adds `GRANT` block for `authenticated`/`service_role` in the same migration + RLS scoped to `has_role('hrms_razorpay_sync')` and `super_admin`.
- Enum extensions: add `push_bank`, `push_salary_structure`, `push_attendance`, `push_dismiss`, `payroll_execute`, `payroll_finalize`, `payslip_pull`, `tds_pull`, `razorpay_edit` to `hr_razorpay_sync_action`.
- `hr_razorpay_push_queue` uses partial unique index `(hr_employee_id, domain) WHERE status='pending'` to collapse repeated edits into one push.
- New edge fn `razorpay-drift-walk` runs nightly via `pg_cron` calling the proxy with `action='drift_walk'`.
- Component mapping (Phase 5) is the one manual step that cannot be automated — plan for an operator UI, not a script.

## Open items requiring operator input before build

1. Which Razorpay tenant fields are considered authoritative today (any HR still edits on Razorpay directly)?
2. Should EPF/ESI filings continue via Razorpay after payroll orchestration switches, or move to a separate compliance tool?
3. Cadence for `apply-scheduled-salary-revisions` — currently no `cron.schedule` in migrations; needs confirmation before wiring salary-push triggers.

## Next step

If this plan is approved, Phase 2 (probe & envelope catalogue) is the immediate build — small, read-mostly, no push risk, and it produces the green/red matrix that unlocks every subsequent phase.
