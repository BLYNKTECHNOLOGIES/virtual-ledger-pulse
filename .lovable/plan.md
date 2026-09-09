# Make Terminal inbox match the live Binance conversation

## Confirmed from the two same-time screenshots

- `User-310bc` has a new active order at 00:22, but Terminal labels it `UNKNOWN` even though the live order cache already contains `buyerNickname = User-310bc`.
- Binance reused that counterparty's `groupId` across an older completed order and the new active order. Frames without `topicId/orderNo` were therefore attached to the older order by the current history-only fallback.
- The newest Binance image/ad-conversation activity can consequently rank under the wrong order or fail to become the visible preview.
- Human unread counts and Binance system notices are separate concerns. System-generated notices will remain excluded from Terminal unread counts as requested.

## Fix

1. **Resolve orderless frames against live orders first**
   - Update the shared database resolver to use the active-order cache's side-aware buyer/seller nickname before historical orders.
   - Prefer a currently active order created closest to the message time; use history only when no live match exists.
   - Apply the same resolver on every insert/update so reused `groupId` values cannot anchor a new message to an old completed order.

2. **Fill inbox identity and status from the live cache**
   - Update the inbox data function to derive the counterparty nickname from `buyerNickname` for SELL orders and `sellerNickname` for BUY orders when history/chat nickname is not yet available.
   - Prefer the freshest live-cache status over stale history status.
   - Keep verified names when known; never show `UNKNOWN` when Binance supplied a live nickname.

3. **Repair affected rows**
   - Reassign the `User-310bc` messages that arrived after the new order was created from the older completed order to active order `22931076599374061568`.
   - Re-run the same deterministic repair across other recent reused-group frames, without merging independent order chats.

4. **Inbox freshness**
   - Keep the persistent listener as primary and minute sweep as recovery.
   - Ensure image messages produce `[Image]` previews and both inserts and updates immediately refresh the inbox.
   - Keep system notices visible only where appropriate, but excluded from human unread totals.

## Verification

- Compare the exact screenshot identities against the inbox RPC after repair.
- Confirm `User-310bc` shows the active order, correct nickname, newest preview/time, and no `UNKNOWN` duplicate.
- Confirm `P2P-ad1129c1`, `User-eff28`, `User-016ae`, and `User-b5fa8` use their newest stored human/image activity.
- Confirm zero synthetic threads and zero duplicate message groups.
- Verify Blynk and ASEC listener health, minute recovery runs, and a clean app build.
- Append the completed repair to the shared state log in IST.
