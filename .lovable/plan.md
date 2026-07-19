## Goal

Produce a rigorous, leaf-level audit of every RazorpayX endpoint that our proxy calls in the Payroll + Payslip + Salary-structure surface. For each endpoint list every response field the Opfin API returns, and for every field state exactly where (or whether) our HRMS consumes it.

## Source of truth for the audit

Two evidence sources, cross-checked:
1. `supabase/functions/razorpay-payroll-proxy/index.ts` — every `fetch(BASE + …)` call, its `request.type`/`sub-type`, the request `data` block, and the code that parses the response (`extractPayrollViewFigures`, `reflectOne`, `pickDeepMoney`, `sumMoneyLeaves`, etc.). This tells us which fields we read.
2. Live samples in `hr_razorpay_payslip_records.source_payload` and `hr_razorpay_payroll_runs.source_payload` (last 30 days) — actual RazorpayX response shapes for our tenant. This tells us which fields RazorpayX actually returns (many documented fields are absent in practice; the audit will call this out).

Where an endpoint has no captured sample in our DB, the audit will mark it "not observed in tenant" rather than guess.

## Endpoints covered (per your "Payroll + Payslip + Salary structure" scope)

Payroll:
- `payroll:view-payroll` — monthly payslip / salary snapshot per employee-email
- `payroll:run` (compute) — dispatch a payroll run
- `payroll:execute` / `payroll:bulk-apply` — finalise a run
- `payroll:add-additions` — bonus / reimbursement / arrear line
- `payroll:add-deduction` — one-off deduction line
- `payroll:reset-modifications` — clear additions/deductions
- `payroll:do-not-pay` — pause an employee for one month
- `payroll:recall` (period reopen, our-side + upstream)

Salary structure (people-scoped):
- `people:set-salary` — write annual-CTC or component structure
- `people:view` (only the salary block portion of the response — full people:view fields will be marked "out of scope, see phase 1 audit")

Payslip-adjacent:
- `advance-salary:create` — advance recovery
- `contractor-payment:create` / `list-pending` / `get-status` / `delete` (payroll-adjacent payouts)

Deliberately excluded (out of scope): attendance/*, bank-details/*, tds/*, taxdocs/*, people phase-1 profile fields. Called out in the doc's "Scope" header.

## Per-endpoint entry format

Each endpoint gets its own `##` section with:

1. **Wire shape** — HTTP method, path, request body `type` / `sub-type`, and the exact `data` keys we send. Copied from the proxy source with a file:line pointer.
2. **Response fields table** — every leaf field the endpoint can return, in this shape:

   | Field path (dot / dashed) | Kind | Returned by tenant? | Parsed by proxy at | Persisted to (DB column / JSON path) | Rendered in UI at | Notes / API caveat |

   - "Field path" uses the exact wire casing RazorpayX uses (dashed for most Opfin fields).
   - Nested maps (`earnings.*`, `deductions.*`, `employer-contributions.*`, `additions.*`) are drilled to their leaves.
   - "Returned by tenant?" = Yes / No / Structured-runs-only / Never-observed, based on `source_payload` inspection.
   - "Parsed by proxy at" cites the exact function + line (e.g. `extractPayrollViewFigures` line 291–329).
   - "Persisted to" names the target column on `hr_razorpay_payslip_records` / `hr_razorpay_payroll_runs` / `hr_razorpay_payroll_run_lines` / `hr_razorpay_employee_map` / `hr_employee_salary_structures`, or "not persisted".
   - "Rendered in UI at" points at the concrete React file + component (e.g. `RazorpayPayslipsSection.tsx` → detail dialog → PF card), or "not rendered".
   - "Notes" flags known API limitations already established (statutory splits absent, `total-deductions` scalar-only on flat runs, PDF URL never returned, etc.).

3. **Fields we send but the API ignores** — a short bullet list where relevant.
4. **Gaps** — fields the CSV Salary Register carries that this endpoint does *not* return (the reconciliation blockers you keep hitting).

## Cross-cutting summary at the top of the doc

Before the per-endpoint sections:

- **Field → HRMS surface index** (reverse index): sorted list of every field name, with one row pointing at the endpoint(s) that emit it and where it lands. Makes "which API gives me PF-employer?" a one-line lookup.
- **Confirmed API blind spots** (single list, sourced from proxy comments + past audits): no PF/ESI/PT split, no employer-contribution map, no PDF, no advance-recovery breakdown, no salary-register export via API, `view-payroll` returns CTC/12 defaults for non-executed months, `payroll:list` / `status` / `months` / `runs` sub-types don't exist upstream.
- **How to read this doc** — the legend for the table columns.

## Deliverable

Single markdown file at `docs/RAZORPAY_API_FIELD_AUDIT.md`, roughly 800–1200 lines. No code changes. No behaviour changes. The doc is a reference the HR team and Claude (external audit agent) can both use.

## Technical notes

- I will read live samples with `supabase--read_query` against `hr_razorpay_payslip_records.source_payload` and `hr_razorpay_payroll_runs.source_payload` before drafting each section, so the "Returned by tenant?" column is grounded in real data rather than assumed.
- Every "Parsed by proxy at" citation will include a file path and line number so it stays verifiable if the proxy changes.
- The doc will not repeat the executive-summary "why isn't PF here?" narrative already in `RAZORPAYX_COMMISSIONING.md`; it will link to it and stay field-focused.
