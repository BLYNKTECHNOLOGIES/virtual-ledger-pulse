
# Verification of each claim

**A6 — Two payslip tables, no canonical owner. TRUE.**
`hr_payslips` is read by `PayslipsPage`, `PayrollDashboardPage`, `DataHealthPage`. `hr_razorpay_payslip_records` is read by `EmployeeProfilePage`, `RazorpayPayslipsSection`, `StatutoryReportsPanel`, `SalaryRegisterImportPage`, `UserProfile`, `RazorpaySyncPage`. Two writers, two shapes, no join key contract → a payslip visible on one screen can be absent on the other.

**A7 — Advance Salary implemented-but-unreachable. TRUE.**
`razorpay-payroll-proxy` registers `advance_salary_create` (write, gate: payouts). Vocabulary and enum values exist. But: no UI caller anywhere in `src/`, no `hr_loans.razorpay_advance_id` column, no repayment reconciliation.

**A8 — Regularization page vs no-intervention doctrine. Needs disposition.**
`AttendanceRegularizationPage` still routed. Under the doctrine only the watchdog is a manual door. Decision proposed below: **repurpose, don't delete.**

**A9 — Repo hygiene. PARTIALLY TRUE.**
Confirmed present: `fix_proxy.py` at repo root, `docs/binance_api-17.pdf` inside HRMS docs. Not present: `apply-scheduled-salary-revisions` edge function was already removed (only `hr-promote-scheduled-salary-revisions` deploys).

**A10 — Silent-failure dispositions.**
- P3 (report emails): dispatch cron `dispatch-report-emails-5min` runs; 4 emails sent last 7 days → **addressed but unverified**. Add a health tile.
- P4 (bell decorative): CONFIRMED. `hr_notifications` has 0 rows and no writer anywhere in edge functions or `src/` — only `HorillaHeader` reads it. Every "notify" expectation is silent.

**A11 — Sandbox toggle still deferred. TRUE per STATE LOG 2026-07-18.**

---

# Implementation plan

## Slice 1 — Unify payslips (A6)

**Doctrine:** `hr_razorpay_payslip_records` is the **canonical owner** (matches "RazorpayX Primary Authority"). `hr_payslips` becomes a derived, read-only projection.

**Backend:**
- Add `hr_payslips_v` view mapping the 32 legacy columns from `hr_razorpay_payslip_records` (net, gross, month, employee_id, etc.), plus a `source = 'razorpay'` tag.
- Add `razorpay_payslip_id uuid` FK on any legacy `hr_payslips` rows we keep; write a `hr_payslip_link_orphans()` audit function that flags legacy rows without a razorpay counterpart.
- Deprecate direct writes to `hr_payslips`: add a `BEFORE INSERT` trigger that raises unless a `service_role` context flag is set (allows the one-off backfill).
- Rebuild the projection nightly via `hr-sync-payslips-projection` cron.

**Frontend:**
- Point all seven consumer files at `hr_payslips_v` behind a single `usePayslips(employeeId, period)` hook.
- Add a "Payslip source" badge on `PayrollDashboardPage` and `PayslipsPage`: `RazorpayX` (green) / `Legacy-only orphan` (amber, links to Data Health).
- `DataHealthPage`: add "Payslip parity" tile — orphan count + one-click reconcile.

## Slice 2 — Wire Advance Salary end-to-end (A7)

**Backend:**
- Migration on `hr_loans`: add `razorpay_advance_id text`, `razorpay_pushed_at timestamptz`, `advance_type text check (advance_type in ('loan','advance'))`, `repayment_source text check (in ('salary_deduction','manual'))`.
- New RPC `hr_create_salary_advance(employee, amount, reason, recover_from_month)` — inserts `hr_loans` row (`advance_type='advance'`), calls proxy `advance_salary_create` via `hr_call_razorpay_proxy` helper, stores returned id, logs to `hr_razorpay_sync_log`.
- Repayment reconciliation: extend `hr_compute_payroll_inputs` to auto-emit a `hr_payroll_input_deductions` row for the covering month(s), tagged `source='razorpay_advance'`, idempotent by `(loan_id, month)`.

**Frontend:**
- `LoansPage`: add "New Salary Advance" action → dialog collecting amount, reason, month; posts to RPC; awaits proxy verification (reuse `razorpayVerify`); shows push result dialog.
- Per-employee "Advances" tab inside profile with status pill (Draft / Pushed / Recovering / Closed) and repayment ledger.
- Gate action by `hr_manage_payroll` permission.

## Slice 3 — Regularization page disposition (A8)

**Decision: repurpose, don't delete.**
- Rename route `/hrms/attendance/regularization` → `/hrms/attendance/interventions` (keep old path as redirect for 60 days).
- New page composition = three sections:
  1. **Stale sessions to resolve** (already built in Slice 2 of last plan — move card list here from Overview banner).
  2. **Regularization requests** (existing table) — but only accepts requests that reference a `stale_session_id` OR a documented reason code from a fixed enum; free-form requests disabled.
  3. **Audit** — every intervention logs who/why to `hr_attendance_intervention_log` (new table).
- Add banner: "This is the only manual door. Routine anomalies self-resolve."
- Removes the "quiet manual-edit surface" risk while keeping a single legitimate home for the watchdog + rare exceptions.

## Slice 4 — Repo & function hygiene (A9)

- `git mv fix_proxy.py .archive/scripts/fix_proxy.py.bak` (or delete after inspection; it's a scratch script).
- `git mv docs/binance_api-17.pdf docs/reference/binance/binance_api-17.pdf` — out of HRMS-relevant doc space.
- Confirm `apply-scheduled-salary-revisions` is undeployed via `supabase--delete_edge_functions` no-op check; delete its source folder if present.
- Add `docs/REPO_LAYOUT.md` recording where scratch scripts, references, and HR docs live so future audits don't re-flag.

## Slice 5 — Activate notification writers (A10-P4) + P3 verification

**P4 fix — make the bell functional:**
- New helper RPC `hr_emit_notification(employee_id, kind, title, body, link, actor)` inserting into `hr_notifications`.
- Wire writers at every doctrine touchpoint:
  - Leave request created / approved / rejected (triggers on `hr_leave_requests`).
  - Regularization / stale-session assignment (triggers in Slice 3 table).
  - Salary revision pushed / verified (in `hr-promote-scheduled-salary-revisions` + client push path).
  - Advance salary pushed / recovered (Slice 2).
  - Announcements published (trigger on `hr_announcements`).
  - Payroll run status changes (trigger on `hr_razorpay_payroll_runs`).
- Notification preferences already exist (`hr_notification_preferences`) — respect them; still write DB row, only suppress email.
- `HorillaHeader` bell: add unread badge polling every 30s (existing query) + toast on new arrivals.

**P3 verification:**
- `DataHealthPage`: add "Report email dispatch" tile — last 24h `sent/pending/failed` counts from `hr_email_send_log`, plus last-run timestamp of the 5-min cron. Red if pending > 5 or last run > 15 min ago.

## Slice 6 — Sandbox toggle (A11)

- Migration: `hr_razorpay_settings.sandbox_mode boolean default false`, `sandbox_base_url text`, `sandbox_revoke_after timestamptz` (auto-revert).
- Proxy: on every request, if `sandbox_mode` and `now() < sandbox_revoke_after`, route to sandbox base URL and add `X-Env: sandbox` header; else production. Never fall through silently — if sandbox chosen but URL missing, refuse with clear error.
- Auto-revoke cascade: cron `hr-sandbox-auto-revoke-hourly` flips `sandbox_mode=false` when `sandbox_revoke_after` passes and inserts a `hr_notification` to Super Admins.
- UI: `RazorpaySyncPage` → "Environment" card with red/amber banner while sandbox is active; toggle requires a fresh WebAuthn biometric confirmation (reuse `terminal-biometric-auth-v2` primitives) and asks for a duration (max 24h).
- Verification envelopes tag rehearsal runs so production reconciler ignores them.

---

# Delivery order & shape

Six independent slices, each ≤ one migration + one UI page + optional cron. Recommend order **5 → 1 → 2 → 3 → 4 → 6** because notifications (Slice 5) plug into every subsequent slice, and hygiene (4) + sandbox (6) are lowest urgency.

# Technical appendix

- All new tables ship with the required 4-step `GRANT` block per project rules.
- `hr_notifications` RLS: employee reads own; HR reads all.
- All new cron jobs registered via `cron.schedule` in the `supabase--insert` tool (not migrations), following the scheduling doctrine.
- Every Razorpay call in Slices 2/5/6 goes through the existing verify → gate-unlock → log path — no new bypasses.
- No new intervention doors are added (Slice 3 explicitly narrows the existing one).
