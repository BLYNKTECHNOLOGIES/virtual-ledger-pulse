# New cockpit Step 3 — Separations & Full-and-Final for the payroll cycle

Today the Monthly Payroll Cockpit runs 10 steps and F&F work happens elsewhere (Separation page / F&F page). If someone exits in the payroll month, nothing in the cockpit sequence makes HR look at it before LOP and inputs are pushed — so an F&F addition/deduction can miss the run.

This adds one new step, inserted **before the current Step 3 (Salary revisions)**, that puts all separation and F&F work for the selected payroll month inside the cockpit.

## What the new step does

New **Step 3 — Separations & Full & Final for this cycle** (existing steps 3–10 shift to 4–11).

Opening the step shows a cockpit tool panel for the selected month with three sections:

1. **F&F settlements scheduled for this payroll cycle**
   Every settlement whose payroll cycle month is this month (settlements without a cycle fall back to their last-working-day month). Each row shows employee, last working day, net payable, status (draft / calculated / pending approval / approved / paid / cancelled) and the RazorpayX push state. Editable in place through the same shared F&F dialog already used by the F&F page and the exit checklist — same calculation engine, same withholding-reason rules, same save path, so nothing forks.

2. **Exits in this month with no F&F yet**
   Employees whose resignation/last working day falls in the month and who have no active settlement. One click opens the same F&F dialog with the employee fixed and figures auto-filled, and creates the settlement — visible immediately on the F&F page too (single record, single source).

3. **Initiate a resignation**
   The same initiate-resignation form used on the Separation page (employee, resignation date, notice-period end, last working day, reason), so an exit discovered during payroll can be recorded without leaving the cockpit. It writes the same employee fields as today; the exit checklist continues to be the place for the remaining exit tasks.

The panel also warns when a settlement's payroll cycle points at a **closed** month, and lets HR retag it to the open cycle.

## Step completion rule

- **System: complete** when, for this month, no settlement is still sitting in draft / calculated / pending-approval, and no in-month exit is missing a settlement.
- If there are no exits and no settlements for the month, the step is complete automatically ("Nothing to settle this cycle").
- Approved settlements that are not yet pushed are surfaced as a warning line and are the reason to visit Step 5 (Inputs push) — F&F amounts continue to flow into payroll exactly as they do today, tagged as F&F.
- Like other steps it stays **skippable** (per the agreed close-month policy); it is not a hard blocker.

## What does not change

- F&F calculations, RazorpayX salary authority, penalty/deposit/recovery logic, withholding reasons, delete/reversal flow.
- The push path: F&F still reaches payroll through the existing additions/deductions mirroring, shown read-only on the Inputs step.
- Separation finalisation still happens only after the F&F is paid and verified.
- The F&F page and the exit checklist keep working unchanged.

## Technical notes

- Migration: renumber `hr_payroll_cockpit_state` rows (`step_no >= 3` shift +1, using the existing two-pass offset trick), widen the check constraint to 1–11.
- Rewrite `hr_cockpit_month_state(_month)`: insert `separations_fnf` as step 3 with a `live_detail` payload (`fnf_total`, `fnf_open`, `fnf_approved_unpushed`, `fnf_paid`, `exits_in_month`, `exits_without_fnf`), renumber the rest to 4–11. Cycle matching: `COALESCE(payroll_month, date_trunc('month', last_working_day))`, excluding cancelled.
- Update `hr_close_payroll_month`: blockers loop `step_no <= 10`, final ack on step 11.
- Frontend `src/pages/hr/MonthlyPayrollCockpitPage.tsx`: add `separations_fnf` to `STEP_ICONS`, `STEP_STAGE` (new "Separations" stage between Attendance and Compensation), `STEP_TARGET`, and a `DetailLine` case.
- New `src/components/hrms/SeparationsFnFPanel.tsx` (month-scoped), registered in `CockpitToolSheet` as tool key `separations` and passed the `month` prop like the other month-aware tools; reuses `FnFSettlementDialog`, `createFnFDraft`, and the existing resignation-initiation mutation shape.
- Verification after build: elevated SQL check that `hr_cockpit_month_state` returns 11 correctly ordered steps for the current and a prior month, that ack rows survived renumbering, and that step 3 detail counts match the live F&F/exit rows; state log entry in IST.
