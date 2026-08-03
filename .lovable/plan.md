# Payslip email dispatch inside Cockpit Step 7

Add a "Send payslip emails" capability to Step 7 (Import payslips / Salary Register) of the Monthly Payroll Cockpit, using the approved email design, with per-employee data assembled from the authoritative payroll records — never invented.

## What the user gets

Inside Step 7's tool sheet, a third panel: **Payslip email dispatch**.

1. **Upload payslips** — drag-and-drop the month's payslip PDFs (bulk). Each file is matched to an employee by filename (badge ID / RazorpayX employee ID / name), shown in a match table with a manual employee picker for anything unmatched or ambiguous. Files are stored per employee/month; nothing is sent until every file is confidently matched.
2. **Recipient review table** — one row per payable employee for the month with: name, email, gross, deductions, net, LOP days + amount, bonus/addition lines, PDF attached (yes/no), send status. Rows are colour-flagged when something is missing (no PDF, no email, no register data, do-not-pay).
3. **Send** — sends only to selected, fully-ready rows. Idempotent: an employee already sent for that month is skipped unless explicitly re-sent. Every send is logged; failures are visible and retryable.
4. **Preview** — "Preview my copy" renders one employee's real email and sends it to the operator before mass dispatch.

## Data rules (the "logically correct" part)

Per employee, for the selected month:

- **Amounts** come from `hr_razorpay_payslip_records` for that employee + month. Preference order: Salary Register columns (`reg_gross_salary`, `reg_net_pay`, `reg_pf_ee`, `reg_esi_ee`, `reg_pt`, `reg_tds`, `reg_working_days`) when the register has been uploaded, otherwise the RazorpayX API figures (`gross_earnings`, `total_deductions`, `net_pay`). The email states which basis was used internally in the log, not in the employee's copy.
- **LOP** comes from the staged LOP deduction rows (`hr_payroll_input_deductions`, `source = 'auto_lop'` / lop rows) using `lop_days` and `amount`, and only counts rows actually pushed and read-back-verified in RazorpayX. If LOP days is 0 the block is omitted entirely.
- **Bonus / additions** come from `hr_payroll_input_additions` for that month (label + amount + type), again only verified-pushed rows. Congratulations wording appears only when at least one addition exists; the label is shown verbatim (Performance Bonus, Overtime, Arrears, Reimbursement).
- **Recoveries** (loan EMI, security deposit, error recovery) are listed as deduction lines from the same authoritative deduction rows so the net ties out.
- **Exclusions** — skipped: `do_not_pay = true`, employees with no payslip record for the month, dismissed/relieved employees (`reg_has_left`), and anyone missing an email address.
- **Tie-out gate** — before a row is marked sendable, the email's own arithmetic (gross − deductions = net) must equal the stored net within ₹1. Rows that fail the tie-out are blocked with a visible reason instead of being emailed.
- **Sequencing gate** — dispatch is only enabled once Step 6 (run on RazorpayX) is acknowledged; a warning shows if the month is not yet closed.

## Technical notes

- New Supabase storage bucket `payslips` (private), path `<period_month>/<employee_id>.pdf`; signed read for the dispatcher.
- New edge function `hr-send-payslip-emails`: takes `{ period_month, employee_ids[], dry_run }`, re-derives every figure server-side from the DB (client-sent numbers are ignored), attaches the stored PDF, sends over the existing HR SMTP relay, and writes one row per send to `hr_email_send_log` with `template_name = 'payslip_monthly'` and metadata `{ employee_id, period_month }` — that pair is the idempotency key.
- Email HTML is the approved v2 design, converted into a template function with the LOP and bonus panels rendered conditionally.
- UI: new `PayslipEmailDispatchPanel` component surfaced in `CockpitToolSheet` under the `payslip_import` tool, alongside the existing importer.
- Step 7's cockpit detail line gains "· N/M payslip emails sent".

## Cockpit gaps found while reviewing (separate from the above)

Verified from the code and the current July data:

1. **Step 9 (drift review) does not block month close.** The blockers list filters `step_no <= 8`, so a month can be closed with unexplained drift alerts open. Step-count also reads "x/9" while ten steps exist.
2. **July has no Salary Register uploaded** (0 register rows against 39 payslip records), so July currently has no PF/ESI/PT/TDS split available — payslip emails for July would carry only API totals until the register CSV is imported. The dispatcher should therefore require the register before sending, or send totals-only by explicit choice.
3. **LOP and additions are counted as "staged", not "verified pushed"** in the Step 5/6 detail lines, so the cockpit can look complete while RazorpayX never received a row. Suggest switching those counters to the read-back-verified count.
4. **39 payslip records vs 36 active employees** for July — three records belong to inactive/left staff; any per-employee fan-out must be driven by the payslip records joined to active roster, not by the roster alone.
5. **No month-level "payroll processed" fact** exists other than a manual acknowledgement of Step 6; email dispatch inherits that trust. Worth adding a stored processed-on date so payslip emails can state the credit date factually instead of assuming.

Tell me if you want items 1–5 fixed in this same pass or tracked separately; the dispatch feature above does not depend on them except for the register requirement in item 2.
