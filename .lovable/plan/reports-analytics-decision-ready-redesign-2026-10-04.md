# Reports & Analytics — decision-ready redesign

## Goal

Turn the current long chart wall into a calm business review page. Keep every figure tied to its authoritative source, preserve the selected month/month range and owner exclusions, and reduce attendance to workforce availability rather than repeating the Attendance Summary page.

## What will change

### 1. Executive summary first

Replace the eight equal-weight counters with four decision-grade measures:

- **Employer payroll cost** — gross payroll plus employer contributions, clearly separated from net paid.
- **Cost per paid employee** — employer payroll cost divided by distinct paid employees, not active roster size.
- **Closing headcount** — opening headcount + joins − exits, with net movement shown beneath it.
- **Workforce availability** — attendance-equivalent days divided by marked workdays, with the previous equal-length period as context.

A narrow “What changed” row will surface only meaningful movements: payroll change, joins versus exits, pending leave decisions, and report coverage gaps.

### 2. Payroll intelligence

Create one focused payroll section with:

- Monthly employer cost trend split into gross, employer contribution and net paid.
- Cost bridge for the selected period: gross → employee deductions → net paid, with employer contributions shown separately.
- Department cost table/chart combining paid headcount, gross payroll, cost per paid employee and share of payroll.
- Prior-period comparison for single-month views; range views compare against the immediately preceding equal-length range.
- Clear naming: “Gross payroll” is never presented as total employer cost.
- Register coverage remains visible so statutory totals cannot look complete when source data is incomplete.

### 3. Workforce movement and structure

Combine the current headcount, hiring, attrition, department and employee-type visuals into a compact workforce section:

- Opening headcount, joins, exits, closing headcount and net movement in one movement bridge.
- Department view ranked by active headcount, with payroll share beside headcount share to reveal concentration and cost mix.
- Employment-type mix as a concise list with percentages instead of a second decorative pie chart.
- Data-quality flags for missing joining dates or unmapped departments.

### 4. Leave and capacity impact

Correct leave reporting to distinguish requests from days:

- Approved leave days by type and department, using `total_days` rather than request count.
- Pending decision count shown separately from approved usage.
- Leave days per active employee for comparable month-to-month understanding.
- Cancelled/rejected requests excluded from utilisation figures but retained in export detail.

### 5. Attendance stays secondary

Remove the large “Needs attention” panel and weekly late/early/absent chart from this page because those belong in Attendance Summary. Keep one compact availability panel containing:

- Workforce availability rate.
- Average worked hours on evidence-backed worked days.
- Equivalent workdays lost.
- Previous-period movement.

No employee-level attendance exception ranking will remain here.

### 6. Lower cognitive load and stronger traceability

- Organise the page into **Executive summary**, **Payroll**, **Workforce**, and **Leave & availability** sections with consistent headings and spacing.
- Prefer compact ranked rows and comparison bars over pies and dense multi-series charts.
- Preserve drill-down to employee-level monthly payroll and all current exports.
- Add a small methodology/data-quality disclosure instead of repeating technical source footnotes under every card.
- Keep the month/month-range controls and default to the latest processed payroll month.

## Accuracy rules

- Payroll: `hr_payslips_v`; owners/directors remain excluded through the shared exclusion helper.
- Employer payroll cost: `gross + employer_contrib`; net pay is reported separately.
- Paid employee denominator: distinct employee IDs with a payslip in the selected period.
- Headcount: actual joining date from `hr_employee_work_info`, less resignation/last-working-day exits.
- Attendance: evidence-backed rows from the canonical attendance day reader only.
- Leave utilisation: approved/manager-approved day totals; pending requests never count as consumed leave.
- Empty or incomplete sources display an explicit gap, never zero presented as fact.

## Technical scope

- Refactor `src/pages/horilla/ReportsPage.tsx` into small presentation components where useful; no database migration.
- Add a bounded comparison-period payslip query so payroll deltas are calculated from the same source and exclusion rule.
- Keep server-side date filtering and paginated reads.
- Record the report calculation rules in `AGENTS.md` so future report work does not regress them.

## Verification

- Compare current-month payroll totals and departmental totals against direct database aggregates.
- Confirm owner exclusions apply to every KPI, chart, drill-down and export.
- Confirm leave requests and leave days are not mixed.
- Check desktop and phone layouts for clipping, overload and readable chart labels.
- Check the latest preview build and exercise month/range switching, payroll drill-down and exports.
