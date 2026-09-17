# Correct Terminal First-Order Classification

## Finding
The visible badge is not using the existing counterparty-history result. Every Binance order is converted for display with `is_repeat_client = false` and `repeat_order_count = 0`, so the UI labels every order “First Order” even when the stable Binance user ID has many completed orders.

Recent live records confirm the history is available and correctly distinguishes repeat counterparties. Examples from 17 September include prior completed counts of 36, 19, 5, 3, 2, and 1, while the display object still forces zero.

## Implementation
- Make the order summary use the authoritative completed-order count already resolved by stable Binance counterparty user ID and account.
- Show “First Order” only after identity/history resolution confirms zero prior completed orders; show a neutral loading state while still resolving instead of falsely claiming first order.
- Keep account scoping so Blynk and ASEC histories are not mixed.
- Apply the shared behavior to Orders, Appeals, Payer, and Small Payments so no Terminal surface can reintroduce hardcoded first-order values.
- Preserve userNo-first identity matching; do not fall back to masked nicknames or shared verified names when a stable ID exists.

## Verification
- Check a sample of recent genuine first orders and repeat counterparties against `cp_order_identity` plus completed `binance_order_history` rows.
- Verify the photographed Rahul Raj order and other recent repeat examples show repeat counts, while new counterparties remain First Order.
- Run type checks/build and inspect the Terminal UI at desktop and mobile widths.
- Append the completed systemic fix and verification result to the state log in IST.
