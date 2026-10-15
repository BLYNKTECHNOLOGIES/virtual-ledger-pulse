# Terminal rules

- A Terminal order's ERP client is resolved only by Binance userNo on the server (get_terminal_order_client, same rule as clientIdentityResolver); names and nicknames are never matched, because they collide across different people.
- Counterparty contact saves propagate only via propagate_counterparty_contact (exact Binance userNo, else exact unmasked nickname, never a prefix/masked nick) and only fill empty phone/state on approved sales orders, because masked nicknames collide across thousands of people.
- Ad rest start/end runs only on the server (binance-ads startAdRest/endAdRest, shared _shared/adRest.ts; auto-price-engine fires the automatic end before the circuit breaker), because ending must restore each ad once, on its own account, to its pre-rest status.
- Terminal Users writes follow terminal_may_manage_target (supervisor-mapping tree, self-edit admins only); screens read terminal_editable_user_ids via useTerminalEditableUsers and roles change only through save/assign/remove_terminal_role, because screen and server must agree.
- Dashboard periods follow one page clock; reads for a live period use stable bounds and are trimmed in the browser, so time never changes a query key more than once a day (1Y summary: once per half hour).
- Open orders (non-final status) older than the routine 24-hour sync window are re-checked one by one on the server (bounded, per account, never inferring a final status from absence), because routine syncs select orders by creation time only.
- A dashboard period's read keys never change after its natural end; time-driven key changes keep every order exactly once while the new reads land.
