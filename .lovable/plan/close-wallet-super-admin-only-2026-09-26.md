# Close Wallet (Super Admin only)

## What you get
- **Close Wallet button** in Stock Management → Wallets, on each wallet row. Only Super Admins see it, and the server blocks it for everyone else too.
- Confirm box lists each coin balance the wallet still holds (USDT, TRX, etc.) and asks for a reason.
- On confirm: every leftover coin balance is set to zero with an adjustment entry against the Balance Adjustment account, tagged "Wallet closed – <reason>". The wallet is marked **Closed** with who closed it and when. Old entries stay exactly as they are.
- Closed wallets **stop appearing in every wallet drop-down**: purchase, sales, transfers, manual adjustments, product picker, terminal sync mapping, reconciliation and so on.
- **Statistics and reports:** a closed wallet shows only if it has transactions in the selected date range; otherwise its row/column is hidden.
- Wallets tab gets a **"Show closed"** switch so closed wallets can still be viewed. A Super Admin can **Reopen** one (no balance comes back).
- Existing views of old orders still show the closed wallet's name correctly.

## Technical details
- Migration: add `closed_at`, `closed_by`, `close_reason` to `wallets`. Security-definer RPC `close_wallet(p_wallet_id, p_reason)`: checks the caller is Super Admin (via the role hierarchy), locks the row, reads `wallet_asset_balances`, posts one offsetting `wallet_transactions` entry per non-zero asset using the existing adjustment category (so the balance triggers bring it to 0 and adjustment buckets stay out of reporting), then sets `is_active=false` and the closed fields. Plus `reopen_wallet`. Guard trigger: posting a new transaction to a closed wallet is rejected (except the closing adjustment).
- Frontend: shared `useActiveWallets` filter (`is_active = true AND closed_at IS NULL`) applied to all ~35 wallet queries found by grep; lookup/detail queries (showing names of past entries) left unfiltered.
- Statistics/Reports: build the wallet list from wallets that have transactions in the range, plus open wallets.
- Verify: close a test wallet as Super Admin in the preview, confirm the balances go to zero, it's gone from drop-downs and from statistics for an empty range, and that a non-Super-Admin call is refused. Log the change in `docs/STATE_LOG.md`.
