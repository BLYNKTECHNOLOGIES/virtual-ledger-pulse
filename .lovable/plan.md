# Move to userNo-ONLY client matching

## Goal

Make Binance `userNo` the single identity key for matching an order to a client. Fetch the userNo at the moment each sales/purchase order syncs (not only via the 30-min cron / on-demand). Remove every nickname- and verified-name-based *matching* path from both the frontend and the database, leaving no dead code.

---

## Risks of userNo-only matching (you asked — read this first)

These are the genuine issues. The plan below neutralises each one; none is a blocker, but skipping the safeguards would corrupt data the opposite way (splitting one client into many).

1. **userNo is never in the order-list payload.** It only exists in `getUserOrderDetail`. Fetching it at sync time means one extra proxy call per new order → Binance rate limits + IP-whitelist load. Mitigation: only fetch for orders whose userNo is not already cached, run with small concurrency + retry (the proxy already has retry logic).
2. **Reveal window.** Binance only returns counterparty identity for a limited period after the order. Fetching *at sync* is actually fresher than the 30-min cron, so this improves coverage. But some orders (very old, or Binance returns null) will yield **no userNo** → they cannot auto-match and must go to the manual queue. This is safe (no contamination) but means a few orders need manual linking. We will NOT fall back to name.
3. **Our own account IDs.** On BUY orders WE are the taker, on SELL WE are the maker — the "counterparty" side flips. The extractor already flips correctly, but we must also **exclude our own merchant/taker userNos** so we never register ourselves as a client. Requires a reliable list of our userNos (from `terminal_exchange_accounts` / known merchant IDs), mirroring today's `OUR_HANDLES` guard.
4. **Incomplete `client_binance_usernos` backfill (the biggest risk).** Today many existing clients are linked only by nickname. If we delete nickname matching before every existing client has its userNo registered, their next order won't match → a **duplicate new client** gets created. So we must backfill `client_binance_usernos` as completely as possible from historical `order_detail_raw` / `cp_order_identity` **before** removing the nickname fallback, and report how many clients still have zero userNo.
5. **Server-side resolution must move too.** The `create_client_onboarding_approval` trigger and any sync hooks currently resolve by nickname → verified name → phone. If we only change the frontend, the DB will keep matching by name. These must switch to userNo as well, or the change is cosmetic.
6. **Multiple accounts = multiple clients.** userNo is per-account, so one human with two Binance accounts becomes two clients. This is correct per KYC/account distinction — no action needed, just noting it.

---

## Scope decision: matching vs. storage

- **Remove from matching:** all nickname/verified-name resolution logic.
- **Keep as display/audit only:** the `client_binance_nicknames` / `client_verified_names` tables and their read-only display in `ClientOverviewPanel` (historical KYC record). We will **not** drop these tables, but nothing will *match* on them. If you'd rather I also drop the tables entirely, say so.

---

## Implementation

### 1. Fetch userNo during sync (real-time capture)

- In the sales sync (`useSpotTradeSync` / terminal sales sync hooks) and purchase sync paths, after inserting/updating an order that has no cached userNo, call the existing `resolve-order-userno` logic to fetch & upsert `cp_order_identity` + `client_binance_usernos`.
- Do it batched with small concurrency for the newly-synced orders only.
- Keep the 30-min `capture-order-nicknames` cron as a **safety net** for anything missed (but it will now feed userNo, not drive name matching). Optionally rename its intent to nickname/userNo capture — no functional dependency on it for matching.

### 2. Frontend: strip nickname/verified-name matching (`src/lib/clientIdentityResolver.ts`)

- Delete `resolveClientId`, `resolveApprovalIdentityState`, `resolveTerminalApprovalClient`, `fetchVerifiedNameMap`, `captureVerifiedName`, `enrichVerifiedNameByNickname`, `canAttachVerifiedName`, and the sanitizers if unused elsewhere.
- Replace with a single `resolveOrderClient(orderNumber, tradeType, exchangeAccountId)` that returns a client **only** via userNo (`resolveOrderUserNo` → `resolve_client_by_userno`). No name/nickname branches.

### 3. Approval dialogs (`TerminalSalesApprovalDialog.tsx`, `TerminalPurchaseApprovalDialog.tsx`)

- Remove the name/nickname auto-match effects and the "seeded pre-link re-validation/clear" blocks entirely.
- Keep only the userNo path: on open, resolve userNo → if mapped, auto-link + lock; if not mapped, leave unlinked and force manual client pick (with `nameSuggestion` UI removed).
- Remove `crossNameWarning`, `nameSuggestion`, `ambiguousCandidates` name-based UI.

### 4. Database (migration)

- Rewrite `create_client_onboarding_approval` trigger to resolve/dedup **by userNo** (via `cp_order_identity` + `client_binance_usernos`), removing the nickname → verified-name → phone precedence for *matching* (phone dedup for onboarding can stay only as a last-resort dedup guard, or be removed too — your call).
- Drop/replace the `trg_validate_verified_name_attachment` correlation trigger if it's only there to gate name-based enrichment.
- Ensure `link_client_userno` / `resolve_client_by_userno` remain the sole matching RPCs.

### 5. Backfill + report (insert tool, run before/with cutover)

- Backfill `client_binance_usernos` from all available `cp_order_identity` / `order_detail_raw`.
- Produce a count of clients still missing any userNo so we know the manual-linking exposure before flipping off name matching.

### 6. Cleanup

- Remove now-unused imports, types, and any remaining references to nickname/verified-name matching across the codebase (grep for the deleted symbols and `resolvedVia`, `verifiedNameMap`, `nicknameClientMap`, etc.). No dead code left.

---

## What I need from you before building

1. **Confirm table handling:** keep `client_binance_nicknames` / `client_verified_names` as display-only (my default), or drop them entirely? Keep them for display only.
2. **Onboarding phone dedup:** keep phone as a last-resort dedup in the onboarding trigger, or make it strictly userNo-only? make it strictly user.

Once you confirm, I'll run the backfill first (to size the risk), then execute the cutover.