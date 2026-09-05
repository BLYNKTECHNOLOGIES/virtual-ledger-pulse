---
name: Joiner/leaver LOP — RazorpayX prorates, HRMS must not
description: RazorpayX already prorates joining/relieving-month salary; HRMS charges attendance absence only, never pre-joining/post-exit days
type: constraint
---
Verified live 05-Sep-2026 via `payroll:view-payroll`: a 17-Aug joiner on ₹10,000/month is paid `salary: 4839` (15/31) — RazorpayX prorates the joining month itself.

Rule: `generate-lop-deductions` charges ONLY genuine absence inside the employment window (monthly salary ÷ calendar days). Days outside the employment window come from `hr_employment_gap_working_days` and are surfaced as `not_employed_days` / "Not employed (RazorpayX prorates)" for audit — never added to the deduction.

Charging them again is a double deduction (Aug-2026: 6 joiners, ₹35,484 wrongly pushed, reversed via `payroll:reset-modifications`).

Reversal path: RazorpayX has no single-deduction delete endpoint; `payroll:reset-modifications` (clears ALL modifications for that employee+month) is the only API-compliant reversal — safe only when the employee has no other staged/pushed inputs that month.
