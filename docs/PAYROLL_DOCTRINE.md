# Payroll Doctrine — RazorpayX is the primary payroll authority

**Effective:** 2026-07-19
**Status:** Standing doctrine. Overrides earlier plans that positioned HRMS as a computation authority.

## The decision

The owner trusts RazorpayX's calculation engine more than the ERP's own.
RazorpayX is now the **primary computation authority** for payroll.
HRMS is a **faithful image** of RazorpayX — a feeder of inputs and a mirror of outputs.

## Non-negotiable rules

1. **Retired local engine.** `fn_generate_payroll` raises. Nothing else may recompute payroll locally for a payout-facing surface.
2. **Every payroll figure in the UI carries a source tag.** Use `<SourceTag source={...} />` from `src/components/hr/payroll/SourceTag.tsx`:
   - `razorpay` — from an executed RazorpayX API response (authoritative)
   - `register_csv` — from the monthly Salary Register CSV (statutory splits: PF/ESI/PT/TDS/employer contributions — the API does not expose these)
   - `dashboard_only` — visible on the dashboard but not exposed by API; pair with `<DashboardLink />`
   - `local_estimate` — computed inside HRMS; advisory only, never a payout figure
3. **No invented splits.** Where the API returns a total, we display the total plus a `DashboardLink`. We do not fabricate a component breakdown.
4. **Salary structures are a read-cache.** `hr_employee_salary_structures` has `source` + `synced_at`. RLS blocks all authenticated writes; only `service_role` (i.e. the RazorpayX push→refetch flow in `razorpay-payroll-proxy`) may mutate the table. Any HRMS UI that edits a structure must:
   - POST to RazorpayX (`set-salary` / custom-structure) via the proxy,
   - refetch the structure from RazorpayX,
   - upsert with `source='razorpay_pushed'` and `synced_at=now()`.
   Silent local edits are impossible by construction.
5. **Freshness is the primary alarm.** The view `hr_razorpay_payroll_freshness` (last successful pull per employee/period + register-CSV state) is the new health signal. Math-vs-math drift is retained as **advisory only**, labeled as such.
6. **Attendance stays ours.** The v4 attendance engine is unchanged — RazorpayX has no attendance computer. Attendance is one of the inputs HRMS pushes.
7. **Dashboard-only residue.** Payroll runs, payslip PDFs, and TDS documents live only on the RazorpayX dashboard. HRMS surfaces them as honest external links.

## Directional rule for future turns

When adding any new payroll surface, ask in order:
1. Does RazorpayX return this figure via API? → tag `razorpay`.
2. Is it in the Salary Register CSV? → tag `register_csv`.
3. Is it only on the dashboard? → tag `dashboard_only`, add a dashboard link.
4. Is it computed by HRMS? → tag `local_estimate`, and keep it off payout-facing screens unless it's clearly advisory.

If none of 1–3 apply and the number is payout-facing, do not display it.

## Parked follow-ups (with reasoning)

- **Push-side wiring** for approved salary revisions, one-off additions/deductions, and LOP → RazorpayX. Staging tables (`hr_payroll_input_additions`, `hr_payroll_input_deductions`) exist; the actual UI-side push actions from `SalaryRevisionsPage`, `LoansPage`, and `AttendancePeriodLockPage` need per-surface audit before wiring, because each has its own validation and approval flow. Parking until a dedicated turn.
- **Freshness page** at `/hrms/data-health` — view exists (`hr_razorpay_payroll_freshness`), UI surfacing pending.
- **Structure editor rebuild** — the current `EmployeeSalaryStructurePage` still assumes local edits will land in the DB. Under the new RLS, saves will fail. Parking a rewrite: the page will POST via proxy, refetch, and display; until rewritten, it should be treated as read-only.
