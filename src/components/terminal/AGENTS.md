# Terminal rules

- A Terminal order's ERP client is resolved only by Binance userNo on the server (get_terminal_order_client, same rule as clientIdentityResolver); names and nicknames are never matched, because they collide across different people.
- Counterparty contact saves propagate only via propagate_counterparty_contact (exact Binance userNo, else exact unmasked nickname, never a prefix/masked nick) and only fill empty phone/state on approved sales orders, because masked nicknames collide across thousands of people.
- Ad rest start/end runs only on the server (binance-ads startAdRest/endAdRest, shared _shared/adRest.ts; auto-price-engine fires the automatic end before the circuit breaker), because ending must restore each ad once, on its own account, to its pre-rest status.
