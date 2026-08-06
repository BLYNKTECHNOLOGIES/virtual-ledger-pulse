# Delete un-pushed salary revisions

Today, a CTC revision that was already applied (e.g. Satyam Shukla's "Correction" row showing **Not pushed**) has no delete option — only a Push button. The database function explicitly blocks it because the revision already changed the employee's salary structure. This plan adds a safe delete that also rolls the structure back.

## Rule

A CTC / statutory revision can be deleted only when **all** of these hold:
- It was never pushed to RazorpayX (no successful push log for that employee after the revision was created, and no `razorpay_pushed_at`).
- It is the **latest applied revision** for that employee (deleting an older one would rewrite history under a newer change).
- Its month is not payroll-processed and it is not confirmed against an imported salary register (existing guards stay).

If any condition fails, the current behaviour stays: no delete, raise a corrective revision instead.

## What delete does

1. Rolls the employee's active salary structure back to the revision's `previous_total` (proportional rescale, same routine used when applying), and restores the previous basic.
2. Writes the full row snapshot into the existing deletion audit table with the reason.
3. Removes the revision row so history and totals no longer show it.

Because nothing was ever pushed, no RazorpayX reversal is needed — no warning toast for this case.

## UI

- Show the trash icon on un-pushed applied CTC revisions, next to the Push button.
- Confirmation dialog states the rollback explicitly: "Salary will revert from ₹1,10,328 to ₹1,80,000" plus the mandatory reason field already in place.
- If the row is not the latest revision for that employee, the icon is hidden and the tooltip on the Push button explains a corrective revision is required.

## Technical notes

- New migration replacing `public.hr_delete_salary_revision`: relax the applied-CTC block into the conditions above, add push-log lookup against `hr_razorpay_pushback_log`, and call `_rescale_employee_salary_structure(employee_id, previous_total)` before deleting. Keep the register-confirmed and processed-month guards, and keep the `hr_salary_revision_deletions` audit insert (with a `ctc_rollback` marker in the snapshot).
- `src/pages/horilla/SalaryRevisionsPage.tsx`: extend `isDeletable` to include applied CTC/statutory rows where `pushResult.state !== "verified"` and `!r.razorpay_pushed_at` and the row is the newest applied CTC revision for that employee; extend the delete dialog copy to show the CTC rollback line.
