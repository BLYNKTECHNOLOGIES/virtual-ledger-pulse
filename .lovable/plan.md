
## What the CSV actually gives us

The RazorpayX monthly Salary Register (42 columns, 39 employee rows for Jun 2026) is the **only** source for statutory + component splits — the payroll API doesn't return them. Today's importer captures ~19 fields; the CSV carries 10+ more that are already useful signals in the file:

| Field | Present in file | Currently ingested? | Why it matters |
|---|---|---|---|
| LWF(EE) / LWF(ER) | Yes — nearly every row (-10 / -30) | No | Missing deduction; makes net-pay reconciliation off by ₹10 |
| Overtime | Yes (500, 783, 1500…) | No | Earnings component |
| Performance Linked Incentive | Yes (2500, 3350, 3525…) | No | Earnings component; drives CTC |
| Refund Of Security Deposit | Column present | No | One-off addition |
| Has Left / Relieving Date | Yes — Sitara Singh* marked "Yes / 18-07-2026" | No | Final-settlement signal on payslip |
| PAN, PF UAN, ESI Number | Yes — per row | No (used only for enrollment RPC via presence) | Ground truth for employee-master parity |
| Bank Acc / IFSC | Yes | No | Bank-details parity check |
| DOB, Hire Date, Gender, Dept, Designation, Location, PT Location, Email, Phone | Yes | No | Master-data drift detection |

## Plan

### 1. Schema — add the missing `reg_*` fields
Migration on `hr_razorpay_payslip_records`:
- `reg_lwf_ee`, `reg_lwf_er`, `reg_overtime`, `reg_performance_incentive`, `reg_refund_security_deposit` (numeric)
- `reg_has_left` (bool), `reg_relieving_date` (date)
- `reg_pan`, `reg_pf_uan`, `reg_esi_number`, `reg_bank_acc_no`, `reg_ifsc`, `reg_personal_phone`, `reg_personal_email` (text)
- `reg_department`, `reg_designation`, `reg_location`, `reg_pt_location`, `reg_gender`, `reg_dob`, `reg_hire_date` (text/date)

Rebuild `hr_payslips_v` to expose the new fields and fold LWF into the deductions breakdown so `expected_net = gross − (PF+ESI+PT+TDS+LWF+advance+loan)` reconciles cleanly.

### 2. Importer — capture everything, don't lose fields
Update `src/pages/hr/SalaryRegisterImportPage.tsx`:
- Extend `ParsedRow` + `parseRows` with all new columns (label-based lookup already handles column-order drift).
- Store new numeric fields with `Math.abs` for deductions (LWF), raw for earnings (Overtime, PLI, Refund SD).
- Detect "Yes" → `reg_has_left=true`, parse `DD/MM/YYYY` relieving date.
- Show a per-row **variance chip** in the result table: `csv_net vs (gross − Σ deductions)` so bad CSVs are visible.
- Add a **"Register Insights" summary card** in the result: headcount, total gross, total statutory (PF/ESI/PT/TDS/LWF), total overtime + PLI, count with UAN, count with ESI, count with PT — computed client-side from the parsed rows before import.

### 3. Payslip dialog — reflect the new lines
Update `src/components/hrms/RazorpayPayslipsSection.tsx`:
- Deductions grid gains **LWF (EE + ER)** tile beside PF/ESI/PT.
- Earnings grid gains **Overtime**, **Performance Incentive**, **Refund of Security Deposit** tiles when present.
- **Final-settlement banner** at top when `reg_has_left = true`, showing relieving date + register-CSV source tag.
- Recompute the displayed "Net" using the register total when register is present, so ₹10 LWF discrepancies disappear.

### 4. ESS Salary tab — CTC from register truth
Update the "Salary Information" card (in `src/pages/UserProfile.tsx` / `EmployeeSalaryStructure.tsx`):
- When the latest register month exists for the employee, show **Register-derived monthly CTC** = Basic+DA+HRA+SA+LTA+Employer PF+Employer ESI+PLI+Overtime, tagged `register_csv`, with a "as of <month>" caption.
- Keep the mirrored structure below as the annual template, so both truths are visible with clear source tags.

### 5. Employee-master parity strip (HRMS admin view only)
New collapsible section on the HR admin employee profile (hidden from ESS): compares latest register vs `hr_employees` / `hr_employee_bank_details` / `hr_employee_work_info`:
- PAN, PF UAN, ESI Number, Bank Acc, IFSC, Personal Phone, Personal Email, Department, Designation, Location.
- Each row shows: register value, master value, ✔ match / ✖ mismatch / — master empty, with a one-click "Copy register value into master" action (HR-only, audited via existing `hr_notification_log`).

### 6. New page — "Salary Register Analytics" (per period)
Route `/hrms/payroll/register-analytics`, HR/admin only. Reads `hr_razorpay_payslip_records` where `reg_source_uploaded_at IS NOT NULL`:
- Month picker (defaults latest imported period).
- KPI tiles: headcount, gross, total deductions, net, employer cost (net + employer PF + employer ESI + LWF-ER).
- Statutory tiles: PF (EE/ER), ESI (EE/ER), PT, LWF (EE/ER), TDS — each with % of gross.
- Variable-pay tiles: Overtime total, PLI total, Advance recovered, Loan EMI recovered.
- Enrollment coverage bars: `% with UAN`, `% with ESI`, `% with PT`, `% with PAN`.
- Department-wise gross/net table.
- Separation list: everyone with `reg_has_left = true` in the period, with relieving date.
- CSV export of the currently viewed period.

### 7. Data Health tile
Add a "Register coverage" tile to `DataHealthPage`: for the current + previous 3 months, show `imported_rows / total_payslip_rows` per period, with a link into the import page for gaps. Uses the same query as (6).

## Technical notes
- All new numeric fields use `numeric` (INR precision); deductions stored positive, earnings raw.
- LWF is universal in this CSV (Madhya Pradesh employees) but we don't hardcode state logic — we just persist and display what the register says.
- `hr_derive_statutory_enrollment_from_history` already runs after import; extend it to also flag `has_lwf`, `has_overtime`, `has_pli` if the last 3 months carried non-zero values, so future onboarding can inherit these hints.
- No changes to the RazorpayX proxy — the API surface is unchanged; this is a CSV-side expansion only.
- No new secrets, no cron changes.

## Out of scope (explicit)
- No PDF payslip generation — RazorpayX Opfin has no PDF endpoint (unchanged doctrine).
- No writes back to RazorpayX from the register — CSV is a **read-side** truth for HRMS/ESS.
- No auto-mutation of `hr_employees` master fields — parity strip proposes changes, HR clicks to apply.
