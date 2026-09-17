# Restore merged counterparty chat history

## Finding
The active-order chat currently renders only messages attached to the open Binance order. The previously built counterparty-history hook is not connected to this chat panel. Separately, canceled orders can be absent from history when their stable Binance counterparty identity was never captured, even though their messages are archived.

## Implementation
1. Connect the existing counterparty-history loader to the active chat timeline as read-only earlier-order sections, while keeping replies strictly bound to the currently open order.
2. Use the account-scoped stable Binance counterparty ID as the primary match; include canceled and system-canceled orders. Use an exact unmasked nickname only as a guarded fallback, never a verified-name-only match.
3. Add an on-demand identity repair for archived order chats whose order identity is incomplete, using only Binance-supported order-detail/history data and preserving account boundaries.
4. Make history states explicit: checking, no prior interactions, and unavailable. Do not label unresolved history as a first order.
5. Repair the affected recent records and sweep recent archived chats for the same missing-identity pattern.

## Verification
- Confirm the current OmPrakashPatel order resolves its prior canceled order chats in chronological order.
- Confirm messages remain separated by order and sending still targets only the open order.
- Test completed, canceled, system-canceled, and no-history counterparties across Blynk account scope.
- Run typecheck/build, inspect runtime errors, and query the database after repair.
- Append the completed correction and verification time in IST to the state log.
