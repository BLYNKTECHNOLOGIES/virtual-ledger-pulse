---
name: Shadow payroll engine — advisory only
description: HRMS "Payroll Calculation (Building)" runs an isolated PF/ESI/PT/TDS/LOP computation in hr_shadow_payroll_* to diff against RazorpayX. Never a payout figure.
type: constraint
---
`hr_shadow_payroll_runs` / `_lines` / `_component_breakdown` and the `compute-shadow-payroll` edge fn power `/hrms/payroll/shadow-calculator`. Rules:

- Numbers from this engine render ONLY on that page, tagged `local_estimate` via `<SourceTag>`. Never on payslips, profile CTC, dashboard, or F&F.
- Statutory helpers live in `src/lib/hrms/statutoryCalculator.ts` (import only from the shadow surface + the edge fn's inline mirror). Never import them into payout-facing code.
- Compliance mirror (`hr_razorpay_settings`) drives every switch: PF cap, PF wages basic-only, ESI additions inclusion, PT slabs, filing toggles.
- ESI eligibility gate uses REGULAR monthly gross (excludes additions). PT slabs come from `hr_pt_slabs` keyed by employee `work_state` + optional `special_month`/`special_amount` (e.g. MH Feb ₹300).
- TDS: YTD true-up. Projected annual taxable × slab (new/old regime) − YTD TDS already withheld (`hr_razorpay_payslip_records.tds_amount` for FY-to-date), divided by months remaining.
- Salary split: Razorpay `default_structure_components` mirror when `use_xpayroll_default_structure` is ON, else 50% basic / 25% HRA fallback. Rounding drift lands in `special_allowance`.
- LOP from v4 `hr_attendance_daily.lop_days` (calendar-day divisor, not working-day — matches Razorpay CTC-based LOP).
- `hr_drift_alerts.resolution_direction` records which side won: `update_hrms` | `push_to_razorpay` | `update_essl` | `dismissed`. Never mutate `resolved_at` without setting it.

