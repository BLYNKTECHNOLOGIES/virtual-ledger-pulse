# Salary Register tie-out alert — analysis and fix

## What the file actually says

I re-parsed the July 2026 register you uploaded (46 columns, 33 rows) and recomputed every row by hand.

**The CSV is perfect. Every single row ties out to the rupee.**

- Earnings (Basic + DA + HRA + SA + LTA + Employer ESI + Employer PF + custom heads) = Gross Salary — 33/33 rows, zero variance.
- Gross − Employer ESI − Employer PF − ESI(EE) − PF(EE) − PT − TDS − Advance Salary − Loan EMI − One-time Payments = Net Pay — 33/33 rows, zero variance.
- Totals: Gross Rs 9,32,647 · Net Rs 5,34,134 — which match the tiles on screen.

## How RazorpayX builds these numbers

RazorpayX's "Gross Salary" in the register is a **CTC-style gross**: it already contains the employer-side contributions (Employer ESI Contr., Employer PF Contr.) alongside the take-home heads. That is why the deduction block lists ESI(ER) and PF(ER) as negatives — they are carved back out of Gross on the way to Net Pay, so they are neither a cost on top of Gross nor a real employee deduction. This matches the CTC-inclusive doctrine already used by the shadow payroll engine, so nothing needs to change there.

Example — Aarti Pawaiya: 6,000 + 2,646 + 1,020 + 1,200 + 354 (ER ESI) + 780 (ER PF) = 12,000 Gross. Then 12,000 − 354 − 780 − 82 − 720 = 10,064 Net. Exactly the file's figures.

## The real defect

The red "Gross does not tie out" banner is a bug in our importer, not a data problem.

The importer marks a column as "mapped" only when it is pulled through the mapping helper. The two match-key columns — **Employee ID** and **Name** — are read directly and never marked. Anything unmapped and numeric is then treated as a custom pay head and added into the earnings sum. `Name` is text so it is harmlessly ignored, but **Employee ID is a number**, so every employee's ID is being added to their earnings.

That is exactly the discrepancy shown on screen:

```text
Aarti Pawaiya          ID 26  → 12,026   vs 12,000    diff 26
Abhishek Ranjan Singh  ID 43  → 13,168   vs 13,125    diff 43
Abhishek Singh Tomar   ID 71  → 1,00,071 vs 1,00,000  diff 71
Sushil Verma           ID 10  → 2,20,390 vs 2,20,380  diff 10
```

Every reported difference equals that person's Employee ID. Priya Saxena (ID 1) is absent from the alert only because the banner uses a Rs 1 tolerance. This also explains why "Employee ID" is listed first under "Custom pay heads detected" — it is being stored as a pay head on the payslip record.

## Fix

1. Mark the `Employee ID` and `Name` columns as mapped so they are excluded from custom-pay-head detection and from the earnings tie-out sum.
2. Defensively exclude all identity/metadata columns (dates, PAN, UAN, ESI number, bank account, IFSC, phone, working days) from custom-pay-head detection by whitelisting only unmapped columns that are genuine amount columns, so a future RazorpayX column rename cannot re-introduce the same class of bug.
3. Re-verify after the fix: all 33 rows must show zero tie-out difference and the custom pay head list must read only the real heads (Performance bonus, Employee Engagement, Bonus, Fees, Legal fees, Legal fees pay, Legal fees repay, Legal Fees reimburse).
4. Clean up any already-imported records where `reg_extra_earnings` contains an `Employee ID` entry, so no payslip carries a phantom pay head.

## Technical notes

- File: `src/pages/hr/SalaryRegisterImportPage.tsx`, parser second pass (~lines 173-260). `iEmp`/`iName` come from `idx(...)`, which does not populate the `mapped` set that `colT(...)` populates.
- The tie-out formula itself is correct — including employer contributions in the earnings sum is right for RazorpayX's gross convention. Only the extras term is polluted.
- Cleanup of stored rows is a data update on `hr_razorpay_payslip_records.reg_extra_earnings` for affected months.
