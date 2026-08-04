# Bulk compensation changes via CSV (per category)

Add a CSV-driven bulk path inside the Compensation Change dialog. The template and the
importer are always scoped to the tab you are standing on — CTC change, Addition,
Deduction, One-time payout, or Statutory toggle — so a CTC file can never be applied as
a deduction.

## How it works

Each tab gets a small strip above the form:

`Single entry | Bulk (CSV)` toggle, plus `Download template` and `Upload filled CSV`.

1. **Download template** builds a CSV containing every employee in the HRMS list —
   badge ID and full name pre-filled, one row each, active employees first — with the
   value columns for that category left blank.
2. You fill in only the rows you want to change. **A row with all value columns blank is
   skipped entirely** — no change, no record, no push. That is the explicit rule the
   importer enforces.
3. **Upload** parses the file and shows a review table before anything is written:
   rows to apply, rows skipped (blank), and rows with errors (unknown badge, bad number,
   backdated month, employee not linked to RazorpayX, missing mandatory reason).
   Errors are listed per row with the reason; nothing applies until you confirm.
4. **Apply** runs the same server logic the single-entry form uses, row by row, with a
   progress bar and a final summary (applied / skipped / failed, failures downloadable
   as a corrections CSV you can fix and re-upload).

## Template columns per category

Every template starts with `badge_id`, `employee_name` (both read-only reference —
`badge_id` is the match key, name is ignored on import and only shown for your comfort).

| Category | Additional columns |
|---|---|
| CTC change | `new_total_ctc`, `new_basic` (optional), `revision_type` (increment / promotion / correction / demotion), `effective_from` (YYYY-MM-DD), `reason` |
| Addition | `amount`, `label`, `period_month` (YYYY-MM), `addition_kind` (bonus / arrears / reimbursement / other), `taxable` (yes/no), `notes` |
| Deduction | `amount`, `label`, `period_month` (YYYY-MM), `notes` |
| One-time payout | `amount`, `type` (bonus / performance_incentive / retention_bonus / special_allowance / ad_hoc / one_time_correction), `paid_on` (YYYY-MM-DD), `reason` (becomes the pay-head name), `notes` |
| Statutory toggle | `pf` , `esi`, `pt` (each `yes` / `no` / blank = leave unchanged), `effective_from`, `reason` |

A header comment row explains the blank-means-no-change rule and the accepted values, and
is stripped on parse.

## Validation rules carried over from the single form

- CTC: reason mandatory for promotion / demotion; future effective date is stored as
  SCHEDULED exactly as today; RazorpayX push and read-back verification runs per applied
  row and any unverified row is reported as a failure, not a success.
- Addition / Deduction: amount > 0, label required, month cannot be earlier than the
  current month, employee must be linked to RazorpayX; rows are staged only — pushing
  still happens from Payroll Cockpit Step 5.
- One-time payout: amount > 0, record-only, nothing sent to RazorpayX.
- Statutory: reason mandatory; a flag left blank keeps the current value; a flag whose
  current value is unknown must be filled explicitly or the row errors out.

## Technical notes

- New `src/lib/hrms/bulkCompensationCsv.ts`: per-mode column schema, template builder
  (reuses the `hr_employees` query already loaded by the dialog), a tolerant parser
  (BOM/quotes/blank-line safe), and a per-row validator returning
  `{ apply | skip | error }`.
- New `src/components/hrms/BulkCompensationPanel.tsx`: mode-aware strip, file input,
  review table, progress and result summary with failure-CSV export. Rendered inside
  `ReviseSalaryDialog` under the tab bar; the single-entry form stays untouched and is
  the default view.
- Apply loop calls the existing paths per mode — `apply_salary_revision`,
  `apply_statutory_revision`, and the `hr_payroll_input_additions` /
  `hr_payroll_input_deductions` + `hr_salary_revisions` inserts — extracted from the
  dialog's mutation into shared `applyCompensationRow(mode, row)` helpers so single and
  bulk can never drift apart.
- RazorpayX ID lookup is done once as a batch map over `hr_razorpay_employee_map`
  instead of the per-employee query the single form uses.
- Same query invalidations as the single flow, fired once at the end of the batch.

## Verification before it is called done

- Template downloaded for each of the five categories and checked to contain every
  HRMS employee with badge ID and name.
- A file with a mix of filled, blank and deliberately invalid rows uploaded per category;
  confirm blanks are skipped, invalid rows are blocked with a readable reason, and only
  the intended rows land in the database (verified by querying
  `hr_salary_revisions` / the payroll input tables afterwards).
- One bulk CTC row confirmed to push and read back verified on RazorpayX.
