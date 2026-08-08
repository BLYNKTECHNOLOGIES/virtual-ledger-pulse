# June shadow payroll vs RazorpayX — diagnosis and fixes

## What the data shows right now

June RazorpayX data is present: 36 payslip records for 2026-06-01, of which 35 also carry an imported Salary Register row. **But no shadow payroll run has ever been computed for June** — `hr_shadow_payroll_runs` only holds July and August runs. So today there is literally nothing to compare June against; the "difference" the page shows for June is an empty state, not a variance.

The latest July run (34 employees, 33 with a Razorpay counterpart) shows the failure pattern that will repeat in June if we compute it as-is: **0 of 33 lines tie out**, total absolute net variance ≈ ₹2.2 lakh, with gross differing on 29 lines, PF on 16, ESI on 15, PT on 10.

Four distinct root causes, all confirmed against the rows:

1. **Comparison is basis-inconsistent.** The Razorpay side mixes API figures with register figures. For June, Lavany Pradhan's API net is ₹29,002 while the register net is ₹25,708; Abhishek Singh Tomar's API net is ₹1,00,000 while the register net is ₹0 (a ₹99,782 salary advance recovery sits only in the register). The shadow comparison currently reads one field for gross and effectively another for net, so almost every line is guaranteed to differ.

2. **Register-only deduction and earning heads are invisible to the shadow engine.** June's register carries ₹1,73,783 of advance-salary/loan recovery (July: ₹1,50,001 recovery and −₹2,05,000 of one-time payments) plus LWF, security-deposit refunds, overtime and performance incentives. None of these are staged as HRMS payroll inputs, so they dump into the bridge's "other deductions" bucket and swamp every real finding.

3. **Statutory enrollment flags disagree with reality.** The engine takes PF/ESI/PT enrollment from the HRMS profile. Shubham Singh is flagged `ptEnrolled: false` yet Razorpay deducted ₹208 PT; Abhishek is flagged PT-enrolled but the shadow line charges ₹0. Same class of drift on PF and ESI.

4. **LOP and mid-month employment windows are one-sided.** Sushil Verma's shadow line applies ₹11,815 of LOP that never reached Razorpay (Razorpay gross ₹29,000, shadow ₹22,516). Satyam Shukla's Razorpay gross is ₹2,527 for a part month while the shadow pays the full ₹8,513 — the joiner/leaver window is not clamped, and the register's own `reg_working_days` is ignored.

## The fix

### 1. One declared comparison basis
Pick the register as the Razorpay side whenever a register row exists for that employee/month, and the API payslip otherwise. Store the basis used on each shadow line (`razorpay_basis = 'register_csv' | 'api'`) and show it in the drill-down, so a variance can never come from silently mixing sources. Populate `razorpay_gross`, `razorpay_net`, `razorpay_pf/esi/pt/tds` from that one basis consistently.

### 2. Mirror the register's non-statutory heads
Extend the shadow line with explicit columns for the heads the register already gives us: advance-salary recovery, loan EMI, LWF, security-deposit refund, one-time payments, overtime, performance incentive, and other extra earnings. Feed them into the shadow computation on the correct side, and give each its own head in the Net Variance Bridge instead of the catch-all "other deductions". Anything still unexplained stays in the residual — which then becomes a real signal.

### 3. Reconcile statutory enrollment against register evidence
When the register shows a PF/ESI/PT amount for an employee who is flagged not-enrolled in HRMS (or the reverse), compute the shadow line on the HRMS flags as today but record an explicit `enrollment_mismatch` note on the line and raise it as its own bridge head. This turns a silent rupee difference into a named data-quality finding HR can fix at the source.

### 4. Clamp the employment and LOP window
Use hire date, relieving date (`reg_relieving_date`/`reg_has_left`) and the register's `reg_working_days` to clamp the paid window before proration, and reuse the existing windowed LOP engine (`hr_lop_days_window`) so mid-month joiners and leavers are prorated once, not twice. Where HRMS has LOP that was never pushed to Razorpay, surface it as a dedicated "LOP not pushed" head rather than letting it distort base pay.

### 5. Compute and publish the June run
Once the above lands, run `compute-shadow-payroll` for 2026-06-01, then walk the June variance line by line and report the residual employees that remain — those are genuine findings rather than plumbing noise.

## Technical notes

- Edge function: `supabase/functions/compute-shadow-payroll` — basis selection, register head ingestion, window clamping.
- Migration: add `razorpay_basis` plus the register head columns and `enrollment_mismatch` to `hr_shadow_payroll_lines`.
- UI: `src/components/hr/payroll/NetVarianceBridge.tsx` gains the new heads (recoveries, one-time payments, LWF, overtime, enrollment mismatch, LOP-not-pushed); `src/pages/hr/ShadowPayrollPage.tsx` shows the basis badge per line.
- Doctrine unchanged: every figure stays `local_estimate`; nothing here becomes a payout number.
