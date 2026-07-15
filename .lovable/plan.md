
# RazorpayX ↔ ERP Integration — Revised Plan

## Grounding facts (proven, non-negotiable)

- **Transport is legacy Opfin JSON-RPC**, not REST. Every call is `POST {BASE}/api/{resource}` with body `{ auth:{id,key}, request:{ type, "sub-type" }, data:{...} }`. There are no REST verbs, no `/v1/*` paths, no query-string list endpoints, no `X-Razorpay-Account` header. All previously cited REST endpoints are **retracted** — this plan uses JSON-RPC `resource / type / sub-type` tuples only, and marks unverified ones **UNVERIFIED** with a discovery step.
- Credentials are configured and validated. Proxy is JWT-gated and PII-safe. Do not re-request keys.
- 40 employees are imported as **drafts** in the Onboarding Pipeline with name-card fields only (`people:view` returned no bank/salary payload). The `EmployeeListPage` filter bug is fixed; drafts activate through the existing Onboarding Pipeline.

## Design principles

1. **ERP is the system of record** for every HRMS domain (identity, attendance, leave, salary structure, revisions, payroll pre-run). Razorpay is reduced to **payout execution + statutory filings + payslip archival**.
2. **Complete the roster before any bidirectional push begins.** Pull whatever Razorpay will surrender, then HR completes gaps in ERP; only then do writes flip on, one domain at a time.
3. **Every write domain ships behind a per-domain toggle in `hr_razorpay_settings` (default OFF), a dry-run diff, a pilot-one confirmation, and idempotent payload hashing.**
4. **Existing HRMS engines are untouched as the computation source** — leave triggers, hour-account rollups, payroll state machine, revision scheduler. Razorpay never recomputes; it only receives finalized numbers.
5. **No invented endpoints.** Any sub-type not empirically confirmed via the `probe_endpoint` action or the Postman collection JSON is labelled UNVERIFIED and gated behind a discovery task before build.

## Discovery task (blocks Phase 2+)

For each capability below, run `probe_endpoint` (read-only sub-types) or parse the Postman collection JSON the owner exports from the doc page. Record `resource / type / sub-type / verified?` in a new `razorpay_endpoint_registry` table so no code ever references an unverified tuple.

| Capability | Candidate sub-type (VERIFIED / UNVERIFIED) | How to verify |
|---|---|---|
| Employee read (single) | `people / view` — VERIFIED | already succeeded |
| Employee list / paginate | `people / list` — UNVERIFIED | probe read-only |
| Employee create | `people / create` — UNVERIFIED | Postman JSON |
| Employee update | `people / update` — UNVERIFIED | Postman JSON |
| Employee exit / dismiss | `people / dismiss` (or `separate`) — UNVERIFIED | Postman JSON |
| Bank details | likely nested in `people` or `bank / view` — UNVERIFIED | probe + Postman |
| Salary structure read | `salary / view` — UNVERIFIED | probe read-only |
| Salary structure update | `salary / update` — UNVERIFIED | Postman JSON |
| Attendance / LOP push | `attendance / *` — UNVERIFIED | Postman JSON |
| Payroll run trigger | `payroll / execute` (or `run`) — UNVERIFIED | Postman JSON |
| Payroll status | `payroll / status` — UNVERIFIED | probe read-only |
| Payslip fetch | `payslip / view` or `download` — UNVERIFIED | probe read-only |
| TDS / Form-16 / challans | `tds / *`, `compliance / *` — UNVERIFIED | Postman JSON |
| Reimbursements | `reimbursement / *` — UNVERIFIED | Postman JSON |
| Webhooks catalogue | UNVERIFIED — may not exist on Opfin | ask owner + Postman |

**Owner action:** export the Postman collection from the doc page as JSON and upload it — this needs no browser rendering and unblocks every UNVERIFIED row above.

## Phased execution

### Phase 1 — Roster completion loop (build immediately after approval; no writes to Razorpay)

- Pull side (read-only, verified subtypes only): expand `people:view` fetch to capture whatever fields it does return per employee and store into `hr_employees` + `hr_employee_work_info` + `hr_employee_bank_details` where present. Anything Razorpay refuses to surrender is flagged as **HR-must-complete** in the Onboarding Pipeline.
- Onboarding Pipeline stays the sole activation surface. Completing all stages sets `is_active=true`; the fixed list filter then reveals the employee.
- Deliverable: every one of the 40 drafts either activated or explicitly abandoned. **Gate to Phase 2:** zero drafts with missing bank/PAN/DOJ/department.

### Phase 2 — Read-only reconciliation (still no ERP→Razorpay writes)

- Nightly `razorpay-reconcile` cron pulls all mapped employees (using verified read sub-types) and computes a **drift report** into `hr_razorpay_sync_log` (masked diffs only). Surfaces in a Drift tab; nothing auto-overwrites.
- Establishes conflict-resolution ground truth per field before any push:

| Domain | Field class | Working surface | Winner on conflict |
|---|---|---|---|
| Identity (name, DOB, gender, PAN, Aadhaar last-4) | ERP | ERP | ERP |
| Contact (email, phone) | ERP | ERP | ERP |
| Work info (dept, designation, DOJ, manager, location, employment type) | ERP | ERP | ERP |
| Bank details | ERP (verified by HR) | ERP | ERP |
| Salary structure & CTC | ERP | ERP | ERP |
| Salary revisions (effective-dated) | ERP | ERP | ERP |
| Attendance / hour accounts | ERP | ERP | ERP |
| Leave balances & approved leave | ERP (triggers own it) | ERP | ERP |
| LOP for a payroll period | ERP (derived) | ERP | ERP |
| Payroll run state | Razorpay executes, ERP orchestrates | ERP triggers, RZP computes tax/payout | Razorpay for tax math; ERP for gross inputs |
| Payslip PDF & TDS challans | Razorpay generates, ERP archives | Razorpay | Razorpay |
| Statutory filings (PF/ESI/PT/Form-16) | Razorpay | Razorpay | Razorpay |
| Exit / F&F final settlement inputs | ERP | ERP | ERP |

### Phase 3 — Employee-master write (ERP→Razorpay, one domain at a time)

Order: `people:update` (identity + contact) → bank details → work info → exit/dismiss. For each:
1. Enable per-domain toggle in `hr_razorpay_settings` (default OFF).
2. Dry-run diff renders the exact JSON-RPC payload for one employee.
3. Pilot-one write, human confirm, then unlock bulk (same gate discipline as the import flow).
4. Idempotency: hash of last-pushed payload stored per employee; identical push is a no-op.
5. New-hire `people:create` piggybacks on Onboarding completion **only after** `update` has run clean for two weeks.
6. Manual Razorpay-side edits are **never** auto-overwritten — they surface in the Drift tab for HR to accept (pulls into ERP) or reject (queues a corrective push).

### Phase 4 — Salary structure & revisions

- Component-map table (`hr_razorpay_component_map`) links ERP salary components to Razorpay component keys (discovered via `salary:view`).
- On approval of an `hr_salary_revisions` row with a future `effective_date`, a scheduled job pushes to Razorpay on that date — never earlier, never bypassing the existing revision engine.
- Retro revisions block the push and require HR to acknowledge that arrears will be settled through the next payroll's earnings, not by rewriting Razorpay history.

### Phase 5 — Attendance / LOP push (period-scoped, immutable once pushed)

- Source of truth: `hr_attendance_daily` + APPROVED `hr_leave_requests` only. Draft leave and unposted attendance are excluded.
- A **Payroll Pre-check screen** shows the exact LOP days per employee that will be pushed, and blocks push if any day in the period is still open/unapproved.
- Push happens once per period; re-push requires an explicit "recall period" action with a written reason (audit-logged).

### Phase 6 — Payroll run orchestration

- New permission enum value `hrms_payroll_execute` (migration adds enum + `system_functions` row + Super-Admin grant). Only holders can trigger payroll.
- Trigger from ERP calls the verified run sub-type; ERP polls the verified status sub-type until terminal. `hr_payroll_runs` state machine advances only on Razorpay's terminal state, never speculatively.
- Failure paths: partial success → ERP marks period `partially_processed`, blocks close-out, surfaces per-employee errors.

### Phase 7 — Pull-back: payslips, TDS, statutory documents

- Once the run is terminal, fetch payslip PDFs into Supabase Storage under `payslips/{yyyy-mm}/{badge_id}.pdf`, TDS entries into `tds_records`, and Form-16/challans into `compliance_documents`. Storage paths are the ERP's canonical link — Razorpay URLs are treated as ephemeral.

### Phase 8 — Reimbursements

- ERP is the intake surface. Approved reimbursements push to Razorpay as one-off earnings in the next open period. No push before manager approval + finance approval.

### Phase 9 — Webhooks or polling reconciliation

- If the Postman collection confirms webhook availability, ship a public HMAC-verified `razorpay-payroll-webhook` Edge Function writing raw events to `razorpay_webhook_events` and reducing into domain tables. **If webhooks are not supported by Opfin (likely — UNVERIFIED)**, the Phase 2 reconciliation cron is the permanent mechanism, run at a tighter cadence (hourly for payroll days, nightly otherwise).

### Phase 10 — Cutover & lock-down

- Per-domain: run two clean cycles with the domain toggle ON while Razorpay dashboard edits are still allowed. On success, revoke non-break-glass Razorpay-dashboard write access for that domain and document the break-glass procedure.

## Safety discipline (applies to every phase with writes)

- All calls through the existing JWT-gated `razorpay-payroll-proxy`. No client-side calls.
- PII-safe logging: mask PAN, Aadhaar, bank account, phone before logging; only field names + hash diffs in `hr_razorpay_sync_log`.
- Idempotency key = SHA-256 of canonicalised request payload; identical replays are no-ops.
- Dry-run diff mandatory before every first push in a new domain.
- Pilot-one confirmation UI required to unlock bulk in every write domain.
- **Test tenant question — needs owner answer:** does Opfin/RazorpayX offer a sandbox org? If **yes**, Phases 3–8 first-runs execute there. If **no**, live-write safeguards are: (i) pilot-one on a single test employee HR designates (ideally a founder or an intentionally created dummy), (ii) writes blocked outside a defined maintenance window for the first cycle of each domain, (iii) each new domain's first live cycle requires explicit Super-Admin confirmation with a typed reason logged to `hr_razorpay_sync_log`.

## What this plan does NOT do

- Does not touch existing HRMS computation (leave triggers, hour accounts, payroll state machine, revision scheduler).
- Does not build any UI or code against an UNVERIFIED sub-type — discovery must land first.
- Does not enable any write toggle by default.
- Does not treat Razorpay's dashboard as an editing surface once Phase 10 lands for a domain.

## Immediate next action after approval

Run the discovery task: probe the read-only sub-types listed above and ask the owner to upload the Postman collection JSON. Fill `razorpay_endpoint_registry`. Only then does Phase 1 build begin.
