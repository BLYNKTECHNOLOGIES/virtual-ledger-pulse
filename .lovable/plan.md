# RazorpayX bulk addition/deduction sheet from Step 6

RazorpayX won't take additions through the connection right now. As a workaround, Step 6 will produce RazorpayX's own **Bulk Additions/Deductions/Loss of Pay** file, filled in. HR can then upload it on the RazorpayX dashboard.

## Where it appears

In Step 6 (Inputs push), there will be a new **Download RazorpayX bulk sheet** button directly below the verification pack. Before downloading, a short preview shows:
- how many lines are included
- total additions, total deductions and total Loss of Pay days
- any line that is blocked, with the reason

## What goes into the sheet

The sheet uses exactly the same layout as the file you uploaded:
- Row 1: title
- Row 2: payroll month as 01/MM/YYYY, plus RazorpayX's instruction notes
- Row 3: headers — Employee ID, Email, Name, Action/Component, No. of days, Amount
- Column G: the dropdown list of names, so the dropdown in column D still works

It also follows the template's rules:
- An employee with several items gets one row per item.
- Employees with nothing to add, deduct or mark as Loss of Pay are left out.

Every money line from Step 6 for the selected month is included. That is the same set the verification pack counts, so the two always agree:
- **Additions:** comp-off payouts, performance incentives, training/part-month salary differences, F&F dues, reimbursements, recovery refunds, manual one-off lines and deposit refunds.
- **Deductions:** loan/advance instalments, security deposits, wrong-payment recoveries, part-month recoveries and manual deductions.
- **Loss of Pay:** one row per employee, using the component "Loss of Pay". It shows the number of days and leaves the amount blank.

## Naming rule: your list only

Column D accepts only the 34 names from your template, with the exact spelling and capitals. Additions use the "| Addition" names and deductions use the "| Deduction" names.

Default name for each kind of line:

| Kind of line | Name used |
|---|---|
| Comp-off payout | Overtime \| Addition |
| Performance incentive | Performance Linked Incentive \| Addition |
| Training CTC difference | Ad Hoc \| Addition |
| F&F dues | F&F settlement - dues \| Addition |
| Reimbursement | Reimbursement \| Addition |
| Recovery/deposit refund | Recovery refund \| Addition |
| Correction | Correction \| Addition |
| Loan instalment | Loan Repayment \| Deduction |
| Advance salary instalment | Advance Salary \| Deduction |
| Security deposit | Security Deposit \| Deduction |
| Wrong-payment recovery | Wrong Payment Recovery \| Deduction |
| Part-month/other recovery | Recovery \| Deduction |

If you have already picked a name on a line in Step 6, that name is used. Addition lines already have a name picker; deduction lines will get the same picker, limited to the deduction names.

If two lines for the same person have the same name, their amounts are added together into one row, matching how RazorpayX stores them.

## Nothing missed, nothing doubled

- **Lines already sent to RazorpayX are left out.** This includes Sushil's and Amit's September loan deductions, so they aren't charged twice. They are listed in the preview under "Already in RazorpayX".
- **Cancelled or dismissed lines are left out.** Recoveries you cancelled and lines dismissed for this month never go in the sheet.
- **Some lines block the download** until fixed:
  - the person isn't linked to a RazorpayX employee ID
  - the line has no allowed name
  - the amount is zero or below

  Each blocked line is shown with its reason, so nothing quietly drops out.
- **The sheet must match the verification pack.** Before the download, the system checks the sheet's totals against the pack's totals for lines not yet pushed. If they differ, the download stops and shows the difference.

## After you upload it to RazorpayX

A new **Mark as uploaded to RazorpayX** button records which lines went through the bulk sheet and when. Those lines then show "Sent via bulk sheet", which stops:
- later Step 6 pushes from sending them a second time
- a later bulk sheet from including them again

Marking is optional, but you should do it as soon as the RazorpayX upload succeeds.

## Technical details

- A new `src/lib/hrms/razorpayBulkSheet.ts` reuses the same reads as `payrollVerificationPack.ts`: additions, deductions, staged LOP and recoveries not yet staged. It writes the template layout with `xlsx`, including a validation on D4:D{n} that references `$G$1:$G$34`.
- The 34 names are stored as a fixed list in the code. The deduction names are added to `hr_razorpay_component_catalog` with kind = deduction, and a `razorpay_label` column is added to deductions if it isn't there already.
- Email and RazorpayX ID come from `hr_razorpay_employee_map` and the employee record.
- "Mark as uploaded" sets `pushed_at` and `push_channel='bulk_sheet'`, with a new column on both input tables, and loan repayments move to pushed. All existing push paths already skip rows where `pushed_at` is set.
- A new `RazorpayBulkSheetDialog` opens from the Step 6 row in `MonthlyPayrollCockpitPage.tsx`.
- **Verification:** generate the September sheet, then check it row by row against the verification pack's Sheet 2 and the database's unpushed rows. Confirm that:
  - opening it with openpyxl shows the same structure and a working dropdown
  - Sushil's and Amit's already-pushed deductions are absent
