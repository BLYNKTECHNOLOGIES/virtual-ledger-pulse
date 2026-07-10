# Make Binance userNo the Primary Client Identity Anchor

## Goal
Shift client↔order linking from nickname (a soft, changeable string) to **userNo** — the stable, unique numeric ID Binance assigns each account. Data confirms userNo is safe: 2,235 distinct userNos, **zero** map to more than one client. Nickname becomes a fallback/display-only signal.

## Key Binance-API constraint (drives the design)
`userNo` (buyerNo/sellerNo) is **NOT** in the P2P order-list payload. It is only returned by `getUserOrderDetail`. Today it is captured asynchronously by the 30-min `capture-order-nicknames` cron. To resolve a brand-new order at approval time, we must fetch its order-detail **on demand** (per your choice).

---

## 1. New source-of-truth table: `client_binance_usernos`
Direct, authoritative mapping from a client to each Binance account (userNo) they own.

```text
client_binance_usernos
  id            uuid pk
  client_id     uuid  -> clients.id
  cp_userno     text  (unique, indexed)   <- the stable Binance account id
  is_active     boolean default true
  source        text  ('order_detail' | 'manual' | 'backfill')
  first_seen_at / last_seen_at / created_at
  UNIQUE (cp_userno)          -- one userNo can belong to only one client
```
- Standard grants (authenticated CRUD, service_role all) + RLS.
- One-time **backfill migration** populating it from `cp_order_identity` joined to `client_binance_nicknames` — safe because the join is already collision-free (verified).

## 2. Resolution RPCs (userNo-first)
- Rewrite `resolve_client_by_userno` to take a `cp_userno` directly and read from `client_binance_usernos` (no nickname hop).
- Add `link_client_userno(p_client_id, p_cp_userno, p_source)` — upserts the mapping, moving a userNo to a new client if a real change is detected (logged).
- Update `get_client_usernos` to read from the new table.

## 3. On-demand userNo fetch at approval/sync time
New edge function `resolve-order-userno` (reuses the exact proxy call + `extractCounterparty` logic already in `capture-order-nicknames`):
- Input: `order_number` (+ exchange account, trade type).
- Calls `/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, extracts `buyerNo`/`sellerNo`.
- Persists into `cp_order_identity` and returns `{ cp_userno, verified_name }`.
- If Binance returns null/restricted userNo, it returns null and the UI shows an explicit "userNo unavailable" state — **no fabricated values** (per project rules).

## 4. Client identity resolver — userNo becomes Priority 0
In `src/lib/clientIdentityResolver.ts` and `src/utils/clientIdGenerator.ts`:
- **New Priority 0:** resolve by `cp_userno` via `client_binance_usernos`. If matched → link, done.
- If order has no userNo yet → call `resolve-order-userno` on demand, then retry Priority 0.
- **Priority 1 (fallback):** phone.
- **Priority 2 (fallback, non-binding):** nickname / verified-name — retained only for orders where userNo genuinely can't be obtained; still never auto-merges distinct same-name people.
- On successful create/link, always write the userNo mapping via `link_client_userno`.
- "userNo changed" handling: if an order's userNo already belongs to client A, never silently move it; keep A. Nickname changes no longer drive linking at all.

## 5. Approval dialogs (`TerminalSalesApprovalDialog.tsx`, `TerminalPurchaseApprovalDialog.tsx`)
- Resolve the counterparty by userNo (on-demand fetch if missing) and **lock** the client selection on a confident userNo match (already partially done — switch its basis from nickname to the new table).
- Show the Binance User Number prominently in the review UI; show "Fetching account ID…" / "Account ID unavailable" states.

## 6. Client Details UI (`ClientOverviewPanel.tsx`)
- "Linked Binance Account IDs (userNo)" section reads from `client_binance_usernos` (authoritative) instead of deriving from nicknames.
- Nicknames stay visible but labelled as historical/display-only.

## 7. Retire nickname-driven logic (per your choice)
- Stop nickname-based **linking**: remove/disable `resolveClientByNickname` as a binding resolver and the nickname enrichment paths in `useTerminalSalesSync.ts` / `useTerminalPurchaseSync.ts`.
- Keep nickname **capture + display** for continuity and for the rare userNo-unavailable fallback, but it no longer creates or merges clients.
- Repoint `get_counterparty_order_history` and related lookups to userNo where they currently key on nickname.
- Leave the `capture-order-nicknames` cron running (now it also feeds userNo into `cp_order_identity`); optionally rename its role to "capture order identity".

---

## Rollout order
1. Migration: create `client_binance_usernos` (+ grants/RLS) and backfill from existing collision-free data.
2. Migration: new/updated RPCs (`resolve_client_by_userno`, `link_client_userno`, `get_client_usernos`).
3. Edge function `resolve-order-userno` (on-demand detail fetch).
4. Frontend resolver + generator changes (userNo Priority 0, nickname demoted).
5. Approval dialogs + Client Details UI.
6. Verification.

## Verification
- Confirm backfill count matches distinct clean userNos and no userNo maps to 2+ clients.
- Live test: take a fresh order with no captured userNo → confirm on-demand fetch returns userNo, links to correct client, and locks the approval selection.
- Confirm same-name distinct accounts still resolve to separate clients.
- Confirm nickname changes no longer create/merge clients.

## Notes / caveats
- If Binance detail is rate-limited or returns no userNo (restricted/expired order), resolution gracefully falls back to nickname and the UI clearly flags that the account ID couldn't be fetched — no placeholder userNo is ever stored.
- No changes to financial/ledger logic; this is purely identity-linking.
