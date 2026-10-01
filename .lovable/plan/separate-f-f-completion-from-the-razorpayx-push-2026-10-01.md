# Separate F&F completion from the RazorpayX push

## Outcome
Step 3 will mean **the F&F decision is complete**, not that its payroll addition or deduction has already reached RazorpayX. Approved settlements will show a clear handoff to the later Inputs Push step, so Step 3 can visibly complete without looking failed or unfinished.

## Changes
- On F&F approval, save and stage the consolidated F&F addition/deduction for the selected payroll month, but do not push it from the Separations step.
- Replace the Step 3 RazorpayX “failed / not pushed” presentation with a neutral **Queued for Inputs step** state. Zero-value settlements show **No payroll input needed**.
- Keep actual RazorpayX push and read-back verification inside the existing Inputs Push step, where the staged F&F row already has its push action and status.
- Keep **Mark paid & finalise** locked until the F&F row is verified on the payroll run, because finalisation deactivates access and offers dismissal.
- Update cockpit wording so approved-but-unpushed settlements are described as handed off to Inputs, not unfinished.
- Preserve failed historical attempts such as Archita’s as queued/retryable in Inputs rather than presenting Step 3 itself as incomplete.

## Technical details
- Add a stage-only mode to the existing `hr-push-fnf` function. It creates/updates the linked payroll input rows without calling RazorpayX; normal mode continues to push and verify them.
- Make both F&F approval surfaces use stage-only mode, keeping one workflow everywhere.
- Adjust the F&F input card to load staged rows, show their linked settlement details, and own retries.
- No change to calculation formulas, settlement statuses, payment-reference requirement, dismissal order, or the cockpit’s existing completion rule: Step 3 is complete when no settlement awaits approval and no leaver lacks an F&F.

## Verification
- Deploy the updated function and test stage-only and push modes.
- Verify Step 3 displays complete with approved queued settlements, while Inputs Push shows the pending F&F row.
- Verify a zero-value F&F needs no push, and a failed push remains retryable only in Inputs.
- Check the preview, database state, and current build logs before reporting completion.
