# Keeping HRMS in step with RazorpayX one-time payments

## What the two documents actually say (verified)

Sushil Verma (Employee ID 10), July 2026 — payslip PDF and the register row agree exactly:

```text
Regular monthly pay      Basic 14,500 + HRA 7,250 + SA 2,464 + LTA 2,900
                         + Employer PF 1,886                      =  29,000
In-payroll variable pay  Performance bonus                        =   6,380   (taxable, no *)
One-time payments        Fees 10,000 + Legal fees 25,000
                         + Legal fees pay 25,000 + Legal fees repay 25,000
                         + Legal Fees reimburse 1,00,000          = 1,85,000  (all marked *)
                                                        Gross Pay = 2,20,380
Deductions               PF(EE) 1,740 + Employer PF 1,740 + EDLI/Admin 146 + PT 208 = 3,834
Advance Salary                                                         -1
One-time payments reversal                                       -1,85,000
                                                          Net Pay =   31,545
```

Confirmed behaviours of RazorpayX that the HRMS must model:

1. Every one-time payment remark becomes **its own pay-head column** in that month's register. The July file grew four extra columns purely because of Sushil's four remarks. The register schema is not fixed month to month.
2. One-time payments are **added to gross and then reversed** in a single `One-time Payments` column (`-1,85,000`), so gross is inflated while net stays true. On the PDF they carry a `*`.
3. Starred one-time payments are shown as **fully exempted** in Yearly Taxable Income; the Performance bonus (no `*`) is taxable. RazorpayX treats starred payouts as money already paid outside payroll.
4. The register's `PF(ER)` (1,886) is the payslip's **employer PF 1,740 + EDLI & admin 146** collapsed into one figure.
5. The `Advance Salary` column carries a stray `-1` — a live rounding artefact worth surfacing, not hiding.

## Gaps found in the HRMS today

- **No HRMS record of any of it.** `hr_salary_revisions` has zero rows for Sushil. Company-wide July one-time payments total ₹2,05,000 (Sushil ₹1,85,000, employee 53 ₹20,000 "Employee Engagement") and none exist in HRMS. Everything you did on RazorpayX is invisible on our side until the register is imported, and even then it only lands as an unnamed JSON blob.
- **Gross is being read as if it were salary.** The payroll base resolver falls back to `reg_gross_salary`; for Sushil that is 2,20,380, which would make one LOP day worth ₹7,109 instead of ₹1,129. A latent, severe LOP corruption.
- **Employee payslip view does not add up.** `hr_payslips_v` shows gross 2,20,380 but exposes only the 29,000 of named components — the six custom heads live in `reg_extra_earnings` and are never surfaced. A ₹1,91,380 hole.
- **Payslip email shows a misleading gross.** The email computes gross 2,18,494 for someone who received 31,545, with the reversal buried as "One-time payment adjustment" among statutory deductions.
- **Stored API net is wrong.** `net_pay` on the July record is 2,20,381 against a true 31,545. The import flags the mismatch in a toast but leaves the bad number in the table for anything else to read.
- **No taxability memory.** Nothing records that the ₹1,85,000 was treated as exempt by RazorpayX — so our own TDS/Form-16 projections and the shadow engine cannot reconcile with the payslip.
- **No employer-PF split.** ECR filing needs A/C 1/2/21/22; we store a merged 1,886.

## What to build

### 1. A first-class one-time payout ledger
Record every one-time payout in HRMS at the moment it is decided, not after the register arrives.

- Extend the existing "One-time payout" mode of the Revise Salary dialog so the operator's **remark becomes the RazorpayX pay-head name** (that is literally what RazorpayX does with it), with a warning that the text will appear on the employee's payslip and in the register as a column.
- Store: amount, payout month, paid-on date, channel, remark/head name, taxable flag, and whether it was paid inside payroll or off-cycle.

### 2. Register-to-HRMS reconciliation for one-time heads
At import time, match each custom pay head and the `One-time Payments` reversal against the HRMS payout ledger for that month:

- matched (label + amount) → mark the HRMS record `confirmed_by_register`;
- head present in the register but absent in HRMS → raise a **"Recorded on RazorpayX only"** exception with a one-click "Record in HRMS" backfill;
- HRMS payout with no matching head → **"Not seen on RazorpayX"** exception.

Backfill the July ₹2,05,000 (Sushil's five heads plus employee 53) through the same path so history is complete.

### 3. Pay-head registry
A table of every pay head ever seen, with classification (regular / variable / one-time-offset / statutory) and taxability. New heads on import are flagged for a one-time classification decision instead of being swallowed into a JSON blob. This is what makes a variable monthly register schema safe.

### 4. Split "regular gross" from "one-time gross" everywhere
Derive `regular_gross = reg_gross_salary − (one-time heads) − employer contributions` and use it for:
- the payroll/LOP base resolver (removes the ₹7,109/day bug);
- CTC-vs-gross drift and shadow-payroll comparison;
- register insights tiles, which should show regular gross, in-payroll variable pay and one-time payouts as three separate totals.

### 5. Honest payslip surfaces
- Expose the custom heads through `hr_payslips_v` so the profile payslip itemises all eleven earnings lines like the PDF.
- Mark one-time lines with the same `*` convention and repeat RazorpayX's footnote.
- In the payslip email, present the reversal in the Net Pay formula (`Gross − Deductions − Advance − One-time payments`) rather than as a deduction line, matching the PDF the employee already has attached.
- Split employer PF into PF (1,740) and EDLI & admin (146) once the register value can be decomposed, for ECR readiness.

### 6. Trust the register over the API
Where `reg_*` exists, treat it as truth: overwrite (or shadow with a clearly-named corrected column) the API `net_pay` of 2,20,381, and keep a visible audit line saying the API value was superseded.

## Technical notes

- Parser (`src/pages/hr/SalaryRegisterImportPage.tsx`): the gross tie-out already passes for Sushil (29,000 + 1,91,380 = 2,20,380) and net ties to 31,545, so no arithmetic fix is needed — the work is classification and persistence of `reg_extra_earnings` into real rows rather than a blob.
- New tables: `hr_pay_heads` (registry) and `hr_one_time_payouts` (or reuse `hr_salary_revisions` with `payout_channel`, plus a `hr_payslip_pay_head_lines` child table for per-head register lines). All with grants + RLS per project convention.
- `supabase/functions/_shared/salaryBase.ts` — replace the `reg_gross_salary` fallback with the regular-gross derivation.
- `hr_payslips_v` — add per-head lines, `regular_gross`, `one_time_total`, `employer_pf`/`edli_admin` split.
- `supabase/functions/hr-send-payslip-emails/index.ts` — restructure the earnings/deduction blocks per section 5.
- No RazorpayX API work is involved: Opfin exposes no off-cycle payout endpoint, so HRMS remains the record-keeper and the register remains the confirmation channel.

## Suggested order

1. Pay-head registry + per-head persistence (unblocks everything else).
2. Regular-gross derivation and the LOP-base fix (highest data-integrity risk).
3. One-time payout ledger, reconciliation exceptions and the July backfill.
4. Payslip view, profile and email presentation.
