# RazorpayX label catalogue for September additions

## Why
RazorpayX currently refuses any addition whose name it hasn't seen before ("Some addition components are not found"). The dashboard only offers names created in earlier months. Until RazorpayX fixes this, every addition the ERP sends must use one of those existing names, spelled exactly as listed (capital letters matter). Our own wording moves into the description.

One warning first: Sabeel's ₹233 was already sent as "Correction", which is on the list, and it was still refused. So the first step is a controlled test. If listed names still fail, the fallback in step 6 lets HR keep payroll moving.

## The approved list (from your screenshots, case-exact)

Additions (all "Ad hoc | Instant TDS deduction"), 26 names:
Correction · Reimbursement · Employee Engagement · Bonus · Recovery refund · loan amount deduction · Service charges · Performance Bonus · Performance bonus · Comp-off encashment 0.5 day(s) · Comp-off encashment 2 day(s) · Comp-off encashment 3 day(s) · Comp-off encashment 4 day(s) · Ad Hoc · Overtime · OVERTIME · Performance Bonus aug · Performance Linked Incentive · F&F settlement - dues · Legal fees · Legal fees pay · Legal fees repay · Fees · Legal Fees reimburse · JULY · Correction — correction for july

Deductions (all "Deduct from Gross Pay"), 7 names:
Advance Salary · Gross Pay Deduction · KPI Loss · Loan Repayment · Recovery · Security Deposit · Wrong Payment Recovery

Arrears breakdown (RazorpayX "Total Arrears" box, dashboard only):
Basic · Dearness Allowance · House Rent Allowance · Leave & Travel Allowance · Special Allowance

## Default name for each kind of line

| What the line is | RazorpayX name used | Description carries |
|---|---|---|
| Comp-off payout (any day count) | Overtime | "Comp-off encashment N day(s) – Sep 2026" |
| Part-month training CTC difference | Ad Hoc | "Salary difference from 17 Sep (training to confirmed CTC)" |
| Performance linked incentive / PLI | Performance Linked Incentive | month + note |
| Performance bonus | Performance Bonus | month + note |
| Security deposit return | Recovery refund | "Security deposit refund" |
| Reimbursements (incl. ESIC reimbursement) | Reimbursement | what was reimbursed |
| F&F dues (incl. Meenu's "October pay FNF") | F&F settlement - dues | settlement reference |
| Manual corrections | Correction | HR's note |
| Loan/advance payout | Ad Hoc | "Salary advance payout" |
| Anything unmatched | none: blocked until HR picks a listed name | — |

HR can switch any line to another listed name before pushing, but only to a name on the list.

September's 47 unpushed lines get these names automatically. HR then sees a before/after review before pushing.

## What gets built

1. **Controlled test first.** One push of Sabeel's ₹233 under the exact name "Correction", trying a few send formats (with and without the tax and kind details). Every RazorpayX reply is recorded. The result decides whether steps 2–5 alone are enough, or the step 6 fallback is also needed.
2. **Label catalogue.** HR keeps the approved list in the ERP: name, addition or deduction, tax treatment, active or not. It starts with the 38 names above. When RazorpayX fixes the bug, HR can add new names, but only after creating them in RazorpayX first.
3. **Every addition carries its RazorpayX name plus our own description.** Comp-off staging, F&F, deposit refunds, recoveries, training CTC differences and manual entries are all covered. One shared database rule fills in the name, so no path can skip it.
4. **Step 6 cockpit rebuild.**
   - "Stage a new addition": the free-text "Payslip label" and "Bonus subtype" boxes are replaced by a pick-list of approved names plus a description box.
   - The staged table gains a "RazorpayX name" column (editable, list only) and shows the description underneath.
   - Lines without an approved name show "Needs a RazorpayX name" and can't be pushed.
   - The same pick-list appears in the employee-profile Adjust dialog.
5. **Push and check.** The push sends the exact approved name. If two lines for one person share a name (e.g. two Overtime lines), they are combined into one line and both descriptions are kept. The description goes in RazorpayX's remarks. After each push, RazorpayX's copy is read back and matched by name and amount before the line is marked pushed. The verification pack and audit history show both the RazorpayX name and our description.
6. **Fallback if RazorpayX still refuses listed names.** A "Enter in RazorpayX" checklist per employee, with the exact name, amount and description to type. Downloadable too. A "Check RazorpayX" button reads RazorpayX back and marks each line pushed only when it appears there with the right name and amount. Nothing is marked done on HR's word alone.

## Deductions and arrears (out of RazorpayX API scope)
- The deduction API takes only one total amount per person per month. RazorpayX files it as a single "Gross Pay Deduction" line, and there's no way to send names. This stays as it is, and deductions worked on 1 September. The cockpit shows the approved deduction names for reference and keeps our breakdown in the remarks.
- The arrears breakdown boxes (Basic, HRA, etc.) can't be filled through the API. Per your choice, training differences go as "Ad Hoc" instead.

## Technical details
- New table `hr_razorpay_component_catalog`: `kind` (addition/deduction/arrear), `label` exact text with a case-sensitive unique key, `tds_mode`, `is_active`, `source`, `notes`. HR-staff write access via `hr_is_hr_staff`, grants included, seeded with the 38 names.
- `hr_payroll_input_additions`: add `razorpay_label text` and `description text`. A BEFORE INSERT/UPDATE trigger `hr_resolve_razorpay_label()` maps source and label to a catalogue name using the table above and copies the original text into `description`. It refuses a `razorpay_label` that isn't an active catalogue name. Backfill the 47 unpushed September lines.
- `razorpay-payroll-proxy`, `payroll_add_additions`:
  - Stop rewriting names with `shortAdditionLabel`. Send `{label: razorpay_label, amount}` only, and combine lines that share a name.
  - Remarks = joined descriptions, ASCII-safe, 250 chars max.
  - Refuse with 400 when a name isn't in the active catalogue.
  - Read-back matches the exact name.
  - Keep the diagnostic capture.
  - Remove the temporary retry variants once step 1 picks the working format.
- New proxy action `payroll_verify_manual_entries`: runs view-payroll per employee and month, and marks lines pushed only on an exact name-and-amount match.
- UI:
  - `PayrollInputsPage.tsx`: staging form, staged table, push guard.
  - New `RazorpayLabelSelect` component.
  - `PayrollAdjustmentDialog.tsx`.
  - Verification pack export.
  - New `ManualEntryChecklist` card.
- Docs: add the rule "additions are sent only under approved RazorpayX names; our wording rides in the description" to AGENTS.md, and a dated line to docs/STATE_LOG.md.
