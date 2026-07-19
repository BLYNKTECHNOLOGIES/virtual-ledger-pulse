
# Plan: RazorpayX = Backend Authority, HRMS = Frontend / Input-Provider

**Direction confirmed:** all salary + statutory calculation lives on RazorpayX. HRMS shrinks to (a) collecting the input data RazorpayX asks for on its inputs (attendance, additions, deductions, advances, structure revisions, lifecycle events), (b) pushing those inputs via every API sub-type we have, and (c) rendering the outputs RazorpayX gives back. Local salary math is retired; local input tables that FEED the API are kept.

---

## Guiding rules for the whole arc

1. **Nothing in HRMS computes gross / net / statutory again.** All local salary math (`fn_generate_payroll`, salary structure formulas beyond CTC → components mapping, LOP amount math, PF/ESI/PT/TDS derivation, penalty→salary posting) is retired.
2. **Local data that FEEDS an API stays.** Attendance days, LOP days, leave accrual, loan/advance schedules, salary revision drafts, employee master (PAN, DOB, DOJ, bank), penalty amounts, additions/reimbursements — all retained. They become "input state" whose only purpose is to serialise into a RazorpayX request body.
3. **Every RazorpayX write endpoint we have a proxy for is wired to a real HRMS UI action.** No orphan proxy paths.
4. **Every read is fetched, not computed.** Payslip UI reads only `hr_razorpay_payslip_records` + `hr_razorpay_payroll_runs`. Fields the API doesn't return show "—".
5. **Statutory-splits gap is closed by a CSV Salary-Register uploader**, not by local re-calculation.

---

## Stage A — Retire the in-house salary engine (no data loss)

**A1 — Drop calculation surface, keep input surface.**
- Retire (`DROP` or hard-gate as no-op): `fn_generate_payroll`, all payroll status-machine triggers, `hr_penalty_post_to_payroll` writers, statutory drift alerts that assert on local `hr_payslips` numbers, `apply_due_scheduled_salary_revisions` local-writer branches.
- Keep and document as INPUT-STATE tables: `hr_employees`, `hr_employee_salary_structures`, `hr_attendance_*`, `hr_leave_*`, `hr_loans`, `hr_penalties`, `hr_employee_bank_details`, `hr_salary_revisions`. Add table comments naming them "RazorpayX input source".
- Retire local `hr_payslips` UI writers; the table stays only for historical rows already imported before the switch, and is read-only.
- Delete `src/lib/hrms/salaryComputation.ts` usages from any live surface; keep the file only if `SalaryStructureAssignments` still needs a client-side PREVIEW of what will be sent to RazorpayX (label the preview "will be sent to RazorpayX, not the payslip").

**A2 — Remove local payroll UI pages that imply we compute:**
- `PayrollDashboard`, in-house "Run payroll", "Generate payslips", "Payroll adjustments (local)", "Statutory reports (ECR/ESI)" pages become RazorpayX-only surfaces or are removed. Keep `PayslipHistoryImportPage` (RazorpayX-only) and the RazorpaySync roadmap.

**A3 — Doc + memory update.**
- Update `RAZORPAYX_COMMISSIONING.md` and the "Payroll and Governance Summary" memory to state: RazorpayX is the authority; HRMS engine is retired, not parked.

---

## Stage B — Wire every input-push API into a real HRMS action

For each flow: (i) name the HRMS UI surface that owns the input, (ii) name the API sub-type it maps to, (iii) name the local input table(s) it serialises.

**B1 — Monthly attendance / LOP push** (`attendance:*` and, where richer, `payroll:run` fields `lop-amount` / `working-days`)
- Trigger: end-of-cycle "Send attendance to RazorpayX" on `AttendancePeriodLockPage`.
- Source: `hr_attendance_daily` (v4 engine output) + `hr_attendance_period_locks` gate.
- Fields sent: working-days, LOP-days, half-days per employee. RazorpayX applies LOP. HRMS stops computing lop-amount.

**B2 — Monthly additions push** (`payroll:add-additions`)
- Trigger: existing `PayrollAdjustmentDialog` (already scaffolded).
- Source: a lightweight `hr_payroll_input_additions` table (kept small; one row per (employee, period, label)) so the operator can build up the request before pushing and re-push if RazorpayX rejects.
- All three types honoured (0 bonus / 1 reimbursement / 2 arrear) with `taxable` boolean.

**B3 — Monthly one-off deductions push** (`payroll:add-deduction`)
- Trigger: same dialog, deduction tab.
- Source: mirror `hr_payroll_input_deductions` table.

**B4 — Advance-salary + loan recovery push** (`advance-salary:create`)
- Trigger: `LoansPage` "Approve & push to RazorpayX" action on rows where `type='advance'` or `type='loan'`.
- Source: `hr_loans`. Populate `hr_loans.razorpay_advance_id` from proxy response (proxy update: capture whatever id RazorpayX returns; if none, store the create-response payload hash).
- After push, HRMS deactivates its own recovery scheduler for that loan — RazorpayX handles recovery in each `view-payroll` cycle.

**B5 — Salary structure revision push** (`people:set-salary`)
- Trigger: `SalaryRevisionsPage` "Publish to RazorpayX" on approved revisions.
- Source: `hr_salary_revisions` + `hr_employee_salary_structures`. Serialised to `{ ctc-annual, components:[…] }`.
- After a successful push, cron `apply_due_scheduled_salary_revisions` STOPS writing to `hr_employee_salary_structures` locally; instead it enqueues a push, and only marks the revision applied after `people:view` reads the new structure back (existing `pull_person_full` job already does this).

**B6 — Lifecycle push** (`payroll:do-not-pay`, `payroll:reset-modifications`, `payroll:recall`, `people:dismiss`)
- Triggers already exist in `RazorpayPayslipsSection` (pause), `FnFSettlementPage` (dismiss), `RazorpaySyncPage` (recall). Audit each button, complete missing wiring, ensure `hr_razorpay_sync_log` captures every call.

**B7 — Contractor payments** (`contractor-payment:create` / `list-pending` / `get-status` / `delete`)
- Trigger: `RazorpaySyncPage` → "Contractor payouts" panel (already exists).
- Source: contractor rows in `hr_employees` (`employee_type ilike '%contract%'`). Fill in the "Create payout" form if not yet wired.

**B8 — Payroll compute + execute** (`payroll:run`, `payroll:execute` / `bulk-apply`)
- Trigger: `RazorpaySyncPage` Stage 5 "Run + Execute payroll".
- HRMS never derives net-pay client-side any more — the "run" call sends only inputs (gross-earnings from RazorpayX-side structure, lop-amount from B1, deductions from B3, loan-emi from B4). Whatever `net-pay` we currently compute pre-send is dropped from the request when RazorpayX can derive it from structure + inputs.

Every wired button writes to `hr_razorpay_sync_log` with the sub-type, HTTP status, and `error_text` for forensics.

---

## Stage C — Output surface (read-only)

**C1 — Payslip / register views** read exclusively from `hr_razorpay_payslip_records` + `hr_razorpay_payroll_runs`. Fields the API doesn't return (PF/ESI/PT splits, employer contributions, PDF url) render "—" honestly. Employee-profile "past payslips" already does this; extend to `PayslipsPage` and the ERP profile view.

**C2 — Monthly CSV Salary-Register uploader** (closes the API gap).
- New page `RazorpaySyncPage` → "Import Salary Register".
- HR downloads the CSV from the RazorpayX dashboard once a month and drops it in.
- Parser: same shape as the file you already uploaded (`BLYNK-...salary_register-YYYY-MM-DD.csv`). Match rows by `Employee ID` (RazorpayX id, already in `hr_razorpay_employee_map`).
- Persist splits to new columns on `hr_razorpay_payslip_records`: `pf_ee`, `pf_er`, `esi_ee`, `esi_er`, `pt`, `tds`, `advance_salary`, `loan_emi`, `one_time_payments`, `basic`, `da`, `hra`, `sa`, `lta`, `employer_esi_contr`, `employer_pf_contr`, plus `source_register_uploaded_at`.
- UI: payslip detail dialog gains a "Statutory splits (from Salary Register)" section that appears only when the CSV row exists; otherwise the "—" stays.

**C3 — Reconciliation dashboard** — a small diff view on the same page that lists any employee where `hr_razorpay_payslip_records.net_pay` disagrees with the CSV `Net Pay` by more than ₹1. Read-only, no writes.

---

## Stage D — Housekeeping

- Update memory files (`payroll-and-governance-summary`, `attendance-and-schema-constraints`) to reflect the retired engine.
- Update `.lovable/plan.md` deferred queue: check off Payroll Adjustments hub, Advance Salary flow, contractor polish (all now built).
- Append one `docs/STATE_LOG.md` entry: `2026-07-19: In-house payroll engine retired; RazorpayX is calculation authority; HRMS is input+output only; CSV Salary-Register uploader shipped.`
- Sandbox host / in-app toggle remains deferred (as in commissioning doc); nothing changes here.

---

## Explicitly OUT of scope for this arc

- No PDF payslip reconstruction (RazorpayX doesn't expose PDFs; unchanged).
- No automatic scraping of the RazorpayX dashboard for statutory splits (the CSV uploader is the answer).
- No sandbox toggle rework.
- No Attendance v4 engine changes (Phase 3+ continues on its own track; Stage B1 only consumes what v4 already produces).

---

## Technical notes (for the technical reader)

- **New tables:** `hr_payroll_input_additions`, `hr_payroll_input_deductions` — each `(employee_id, period_month, label, amount, type, taxable, pushed_at nullable, push_response jsonb)`. RLS as per rest of HR tables (`hrms_razorpay_sync` write, HR read).
- **New columns on `hr_razorpay_payslip_records`:** statutory + register-source columns listed in C2, all nullable.
- **Proxy edits:** `advance-salary:create` handler captures whatever id/blob RazorpayX returns and writes back to `hr_loans.razorpay_advance_id`; `payroll:run` handler drops any client-supplied `net-pay` and relies on RazorpayX's own derivation when structure exists.
- **RPC gates:** `fn_generate_payroll` is renamed to `_deprecated_fn_generate_payroll_2026_07_19` and rewritten to raise `EXCEPTION 'retired: RazorpayX is the payroll authority'` so any lingering caller fails loudly.
- **Cron changes:** `apply_due_scheduled_salary_revisions` refactored to enqueue a `people:set-salary` push instead of writing locally.
- **Removed cron:** any local payroll-generation cron. `razorpay-auto-sync-payslips-daily` stays; a new daily job "reconcile-with-register" only lights up when a CSV was uploaded that day.

I'll wait for your approval before touching any files.
