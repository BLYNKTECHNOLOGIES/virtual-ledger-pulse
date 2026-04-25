Plan

1. Update the receipt template used by the terminal auto-screenshot flow
   - Modify `src/components/payer/ReceiptTemplate.tsx`, which is the shared receipt UI used by `captureReceiptPng()` and therefore by the automatic terminal order screenshot sender.

2. Fix the Completed badge alignment
   - Adjust the top green header status bubble so `✓ Completed` is centered both horizontally and vertically inside the translucent rounded bubble.
   - Replace the current absolute-positioned tick layout with a normal centered inline-flex layout to avoid the text appearing off-center in the generated PNG.

3. Rename the transaction label
   - Change the row label from `UPI Transaction ID` to `Payout ID`.
   - Keep the existing generated ID/value logic unchanged unless a later requirement says the actual source of the ID should change.

4. Verify the change
   - Run a TypeScript/build check after editing.
   - Visually inspect the receipt rendering path where feasible to ensure the badge is centered and the label reads `Payout ID` before finalizing.