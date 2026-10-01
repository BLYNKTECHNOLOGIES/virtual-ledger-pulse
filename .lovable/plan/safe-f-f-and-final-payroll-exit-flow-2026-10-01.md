# Safe F&F and final-payroll exit flow

## Goal
Prevent F&F completion—especially a zero-value settlement—from dismissing an employee in RazorpayX before their final monthly salary is processed.

## Workflow
1. **F&F approval** remains a settlement step. Any additions or recoveries are staged for the monthly payroll Inputs Push step.
2. **Mark F&F paid and close internal access** may deactivate HRMS, ERP login, and biometrics after the settlement is ready. It will not dismiss the employee in RazorpayX.
3. **RazorpayX remains active** until the settlement's final payroll month has an authoritative `processed_on` date.
4. **After payroll processing**, the deferred RazorpayX dismissal becomes eligible and the automated separation sweep sends it using the employee's last working day.
5. **Zero-value F&F follows the same payroll gate.** `nothing_to_push` means only that F&F has no extra line; it never proves final salary is complete.

## UI changes
- Rewrite the confirmation dialog so it clearly says internal access closes now while RazorpayX remains active for final salary.
- Show a distinct state such as **Awaiting final payroll** until that payroll month is processed.
- Remove wording and actions that imply the F&F step immediately dismisses the employee.
- Infer the settlement payment reference from the payroll handoff where available instead of forcing a misleading manual UTR for zero-value settlements.

## Technical details
- Add the final-payroll gate to every dismissal path, including the automated past-LWD sweep and manual separation completion.
- Use `hr_payroll_month_meta.processed_on` for the settlement's `payroll_month` as the authoritative month-completion signal.
- Keep local deactivation separate from `people:dismiss`; do not change RazorpayX payroll amounts or simulate provider state.
- Preserve existing F&F push/read-back safeguards for non-zero additions and recoveries.
- Update operational documentation and the shared state log.

## Verification
- Confirm Satyam's current September settlement can close internal access but cannot trigger RazorpayX dismissal because September has no `processed_on` value.
- Test zero-value and non-zero settlements before and after payroll completion.
- Run the automated sweep in dry-run mode and verify its reported hold/release reasons.
- Verify the mobile confirmation and status wording in the live preview.
