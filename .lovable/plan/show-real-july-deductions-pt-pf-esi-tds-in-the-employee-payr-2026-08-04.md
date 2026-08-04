# Show real July deductions (PT / PF / ESI / TDS) in the employee payroll tab

## What's wrong

The payslip table in the employee profile reads only the columns that come from the RazorpayX API pull. Those columns are empty for PT, PF and ESI **for every employee, every month** — the Opfin `payroll:view-payroll` endpoint returns only a single `salary` figure, never a deduction breakdown. That is why the row shows Gross ₹1,00,000, Deductions ₹0 and dashes across TDS / PF / ESI / PT.

The imported salary register data is present and correct — it just isn't being read. Verified in the database:

- Abhishek Singh Tomar, July 2026: register says PT ₹208, PF ₹0, ESI ₹0, net pay ₹24,792; the API columns are all null and the UI therefore prints ₹1,00,000 net.
- July 2026: 39 payslip rows, 33 have register data. 12 rows show ₹0 deductions while the register has real deductions, and **27 rows show a wrong net pay** versus the register.
- June 2026: 35 of 36 rows imported, 8 zero-deduction mismatches, 23 wrong net pay values.
- So yes — this affects PF and ESI for other employees exactly the same way, not just Abhishek. Abhishek genuinely has PF/ESI = 0 (above thresholds); others have real amounts that are currently invisible.

Six July rows have no register data at all (Abhishek, Rishabh Singh, Sneha Shukla, Vandana Raikwar, Rashi Mandrai, Virendra Kumar Fullare) — these will be shown as "not in register" rather than as zeros.

The reconciled view `hr_payslips_v` already merges the register into the API record and exposes gross, employee deductions, PT, PF, ESI, TDS, LWF, employer PF/ESI, loan EMI, advance salary, one-time payments, recoveries and working days. Nothing new needs to be computed — the profile just has to read it.

## What will change

1. **Repoint the payslip history table** in the employee profile to `hr_payslips_v` (keyed by employee + month) instead of the raw API table.
2. **Correct columns**: Gross, Employee Deductions, TDS, PF, ESI, PT, Net Pay — all sourced from the register when present. Net pay will then match the register (e.g. ₹24,792 for Abhishek in July).
3. **Honest provenance per row**: a small tag showing `Register CSV` (reconciled) vs `Dashboard only` (API-only, breakdown not exposed). Rows with no register import show "Breakdown not imported" instead of ₹0, so an un-imported month can never look like a zero-deduction month.
4. **Expanded detail dialog** on row click: earnings block (Basic, HRA, DA, Special Allowance, LTA, overtime, incentive, one-time payments), deductions block (PF, ESI, PT, TDS, LWF, loan EMI, advance salary, one-time recovery), employer cost block (employer PF incl. EDLI/admin split, employer ESI, LWF), plus working days and register file name / upload time.
5. **Keep everything else intact**: PDF download button, DNP / Paid badges, payroll-adjustment action, compliance-drift warnings.

No writes, no schema change, no change to import or payroll logic — display only.

## Technical notes

- `src/components/hrms/RazorpayPayslipsSection.tsx`: swap the query from `hr_razorpay_payslip_records` to `hr_payslips_v` (`employee_id`, ordered by `period_month desc`), and map the new field names (`gross`, `employee_deductions`, `net`, `pf_amount`, `esi_amount`, `professional_tax`, `tds_amount`, `has_register`, `register_source`).
- Flags currently derived from `source_payload` (`do_not_pay`, paid-on, payment status) and `pdf_storage_path` are still needed; keep them by joining the raw record for those few fields, or read them from the view where already exposed (`pdf_storage_path`, `source` are on the view).
- Deduction magnitudes are stored with mixed signs in the register; display with `Math.abs()` as done elsewhere in HRMS.
- The existing ad-hoc `flattenBreakdown` of `source_payload` in the detail dialog is replaced by the structured blocks above; the raw payload stays available as a collapsed "raw API payload" section for auditing.
