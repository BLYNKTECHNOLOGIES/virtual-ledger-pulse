# Fix stale Terminal chat-list previews

## What will change
- Correct the inbox preview so it always uses the newest stored, non-system message for each exact Binance order.
- After opening a chat triggers Binance history synchronization, immediately refresh the inbox and unread counters instead of waiting for the next interval.
- Add a focused recent-chat reconciliation path so messages missed by the live listener are recovered quickly for the currently opened thread and recent inbox rows.
- Preserve strict account and order boundaries; no cross-order message merging inside an opened chat.

## Root cause already confirmed
For order `22930993028410691584`, the inbox displayed the 00:28 incoming message while the stored Binance history already contained a newer 00:29 incoming message (`Yeah`). The delayed message was captured by history sync at 02:18 IST, but the inbox cache was not directly invalidated by that synchronization flow.

## Verification
- Re-query the exact order and confirm its newest stored message and inbox preview match.
- Confirm Realtime and explicit post-sync invalidation both refresh the list.
- Verify the list updates without reopening or manually refreshing the page.
- Run the relevant type/build checks and inspect current runtime/build signals.
- Record the completed systemic fix in the shared state log.
