# Combined "Both Accounts" Mode for the Terminal

## Goal
The exchange-account switcher already offers three states: **Blynk Binance**, **ASEC Binance**, and **All accounts ("Both")**. Today "Both" silently falls back to the default account. This plan makes:
- **Single account selected** → every view (ads, orders, stats, assets, merchant status) scoped to that one account.
- **Both selected** → the same views show **live-merged** data from both accounts, with each row tagged by a colored account badge. Totals/statistics are combined.

Approach (per your choices): **live merge per account** (client-side fan-out), **colored account badge per row**, write actions auto-route to the owning account, **Create Ad** prompts for the target account when in Both mode.

---

## How it works

### 1. Fan-out helper (core of the change)
Add a reusable helper in `useExchangeAccount` context: `accountsToQuery` = `[activeAccountId]` for a single account, or all `visibleAccounts` ids when `activeAccountId === ALL_ACCOUNTS`.

For live (edge-function) reads, when in Both mode we call the existing `binance-ads` / `binance-assets` function **once per account in parallel** (each call stamped with that account's `exchange_account_id`), then merge the responses, tagging each row with `_exchangeAccountId` so the UI can render the badge. No edge-function rewrite needed — the per-account call path already works correctly.

### 2. Read hooks updated to be account-aware
- `useBinanceAdsList` (`listAds`), `useBinanceActiveOrders` (`listActiveOrders`), `useBinanceOrderHistory` live path, `useBinanceBalances` (`getBalances`), `useBinanceUserDetail` (merchant status):
  - Single mode: one call with the active account (unchanged behavior, now with account in the React-Query key).
  - Both mode: parallel calls across `visibleAccounts`, merged. Each item tagged `_exchangeAccountId`.
  - **Fix stale cache:** add `activeAccountId` to every one of these query keys (currently missing on active-orders, balances, user-detail, order-history) so switching accounts refetches instead of serving the previous account's data.

### 3. DB-backed reads scoped correctly
`binance_order_history` already stores `exchange_account_id`, but client reads don't filter it (cross-account leak today).
- `useBinanceOrderHistory` (DB read), `useCachedOrderHistory`, and `TerminalDashboard` stats:
  - Single mode: filter `exchange_account_id = activeAccountId`.
  - Both mode: filter `exchange_account_id IN (visibleAccounts)` (combined totals). Stats aggregate across both; a per-account breakdown line is shown.

### 4. Source-account badge
A small `AccountBadge` component renders a colored dot + short name (yellow = Blynk, blue = ASEC) using `colorFor`/`nameFor` from context. Shown:
- As a cell/chip on each row in Ads Manager, Active Orders, Order History tables (only in Both mode, to avoid clutter in single mode).
- In merchant/user-status widgets, one badge per account when Both.
- Dashboard/Analytics stat cards show the combined number plus a tiny per-account split.

### 5. Write actions route to the owning account automatically
Existing ads/orders carry `_exchangeAccountId` from the merged fetch. All row-level actions pass that id explicitly so they hit the correct Binance account regardless of the active selection — **no prompt**:
- `markOrderAsPaid`, `releaseCoin`, `cancelOrder`, `sendChatMessage`, edit ad / update ad status, applyAdRiskGuard.
- Implementation: thread the row's `_exchangeAccountId` into `useBinanceActions` calls (passed as explicit `exchange_account_id` in the body, which overrides the active-account default).

### 6. Create Ad prompts for account in Both mode
- Single mode: Create Ad uses the active account (unchanged).
- Both mode: opening Create Ad first shows a small account picker (Blynk / ASEC); the chosen account id is sent with the create request.

---

## Technical details (file-by-file)

**`src/contexts/ExchangeAccountContext.tsx`**
- Export `accountsToQuery: string[]` (single id, or all visible ids when ALL).
- Keep `withAccount` as-is for single calls.

**`src/lib/activeExchangeAccount.ts`**
- Add `getAccountsToQuery()` mirror for non-hook callers (`callBinanceAds`).

**New `src/hooks/useMultiAccountQuery.ts` (helper)**
- `fetchMerged(action, body, accountIds)` → `Promise.all` of per-account `callBinanceAds`/`callBinanceAssets`, each stamped with `exchange_account_id`, returns concatenated rows tagged `_exchangeAccountId`. Handles partial failure (one account erroring doesn't blank the whole view; surfaces a per-account warning).

**`src/hooks/useBinanceAds.tsx`**
- `useBinanceAdsList`: branch on ALL → `fetchMerged('listAds', ...)`. Add `activeAccountId` to query key (already present) and tag rows.

**`src/hooks/useBinanceActions.tsx`**
- `useBinanceActiveOrders`: branch on ALL → merge across accounts; add `activeAccountId` to query key.
- Order/ad mutation actions accept an explicit `exchangeAccountId` arg and include it in the body.

**`src/hooks/useBinanceOrders.tsx` + `useBinanceOrderSync.tsx`**
- Live `getOrderHistory`: ALL → merge. DB reads (`binance_order_history`): add account filter (single = eq, ALL = in).

**`src/hooks/useBinanceAssets.tsx`**
- `useBinanceBalances`: ALL → fetch per account and merge balances (grouped/summed per asset with per-account breakdown). Add account to query key.

**`src/components/exchange/AccountBadge.tsx` (new)**
- Colored dot + name, driven by `colorFor`/`nameFor`.

**Tables/pages** (`AdManager.tsx`, `TerminalOrders.tsx`, `TerminalDashboard.tsx`, `TerminalAnalytics.tsx`, `TerminalAssets.tsx`, merchant-status widget):
- Render `AccountBadge` per row/stat in Both mode; pass `row._exchangeAccountId` into action handlers.

**Create Ad flow** (`AdManager.tsx` / create-ad dialog):
- In Both mode, show account picker before submit; pass chosen id.

**No database migration required** — `binance_order_history.exchange_account_id` already exists; user→account mappings already populated. No edge-function changes required (per-account calls already work).

---

## Out of scope / limitations (Binance API)
- `spot_trade_history` has no `exchange_account_id` column, so spot history can't be split by account without a schema + sync change; it will remain combined. Flag if you want this scoped later.
- Automation engines (auto-price/pay/reply) currently run primary-only; this plan does not change their account scope (separate effort).

---

## Verification
- Switch to **Blynk** → ads/orders/stats show only Blynk (verified via different `advNo` sets already confirmed live).
- Switch to **ASEC** → only ASEC.
- Switch to **Both** → union of both, each row badged correctly; stat cards = combined totals with per-account split.
- Mark-paid / release / chat / ad-edit on a Both-mode row hits the correct account (verified against edge-function logs).
- Create Ad in Both mode prompts for account; in single mode it doesn't.