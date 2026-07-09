
# De-Merge Wrongly-Linked Clients by Binance userNo + Fix the Root Cause

## Confirmed with live data
- **466 clients** hold 2+ active nicknames (430×2, 26×3, 7×4, 1×5, 2×6) of 2,435 linked clients.
- Example G26KTP "MANOJ KUMAR": 6 linked nicknames, but only 2 have real orders → **2 distinct userNos** (`s6f8fc29…` = 7 orders via `Avengers_Associates`; `sbd6bb2d…` = 1 order via `User-b2d25`), both verified "MANOJ KUMAR" → two different people merged by the name-match fallback. The other 4 nicknames have **zero orders**.

## Ground truth = counterparty userNo
Identity comes only from Binance **order detail** (already synced in `binance_order_history.order_detail_raw`): counterparty = `takerUserNo` when our merchant (`BlynkEx`, `merchantNo se7510c53…`) is the maker, else `merchantNo`. There is **no Binance "search by nickname" API**; gaps are filled via the supported **order-detail** endpoint (re-fetch by order number), never a nickname search. Present on 64% of orders (31,876 / 49,283).

## Core model change
Make **userNo the stable client identity** and **nickname a single, mutable attribute**:
- Add `counterparty_user_no` to `client_binance_nicknames` (and track the account's own merchantNo per `exchange_account_id`).
- Each client keeps exactly **one active nickname**; on rename (same userNo, new nickname) the active nickname is **updated**, old kept `is_active=false` only so historical orders still resolve.
- Split rule: split **only across different userNos**. Same userNo across nicknames = one person renamed → stays one client.

```text
Client "MANOJ KUMAR" (G26KTP)
 ├─ Avengers_Associates → userNo s6f8fc29… (7 orders) ── ANCHOR (keeps KYC docs)
 ├─ User-b2d25          → userNo sbd6bb2d… (1 order)  ── SPLIT → new client "MANOJ KUMAR", its 1 order + nickname move here
 └─ MANOJ KUMAR, User-9fd73, User-f1af2, Monu_hr24 (0 orders) ── UNRESOLVED → detach + report, no phantom clients
```

## Phase 1 — Identity resolution engine (read-only)
1. Determine our own merchantNo per `exchange_account_id` (dominant merchant on our-ad orders).
2. `resolve_counterparty_userno(order)` → counterparty userNo + verified_name + nickname from each order.
3. For every `(client_id, nickname)`, aggregate matching orders → resolved userNo, verified_name, exact order_numbers, order/completed counts, turnover, first/last seen.
4. Gap backfill: queue `order_number`s lacking `order_detail_raw` into the existing order-detail sync. Nicknames still unresolved (no orders at all) are marked `UNRESOLVED` — never guessed.

## Phase 2 — Audit report (CSV only, no data change)
`/mnt/documents/client_nickname_merge_audit.csv`, one row per (client, nickname):
`client_code, client_name, nickname, source, resolved_userno, verified_name, order_count, completed_count, turnover, order_numbers, first_seen, last_seen, proposed_action(ANCHOR|SPLIT|UNRESOLVED), proposed_target_client`.
Anchor = the userNo whose verified_name matches the client name and/or owns the KYC docs (ties → most orders, then earliest). **No writes.** You review, then approve Phase 3.

## Phase 3 — Guarded de-merge (only after CSV approval)
Per `SPLIT` userNo (idempotent, fully logged):
1. Create a new client — **same KYC name as parent** (your decision); named split uses verified_name when it differs.
2. Move that userNo's nickname row(s) and its orders/chats/identity rows (sales `supplier_name`/nickname links, `client_verified_names`, `p2p_counterparties`) to the new client.
3. Anchor userNo (with KYC docs, bank details, verified name, limits) stays on the original record.
4. `UNRESOLVED` nicknames (zero orders) are set inactive and listed for RM review — not converted to clients.
5. Everything written to an audit table for reversibility.

## Phase 4 — Root-cause fix (stop recurrence)
1. `clientIdentityResolver.ts`: resolution keyed on **userNo first**, nickname second, verified_name third; pure name match (`name_match`/`name_exact`) becomes **suggestion-only**, never auto-link, whenever the order's counterparty userNo differs from every userNo already on the candidate client.
2. Approval flow: resolve the counterparty userNo from order detail; **existing userNo → same client** (update nickname if changed); **userNo never seen with us → new client**, even on a name match. (This is the correct form of "new person" detection — keyed on our own history, not Binance's lifetime public order count.)
3. DB guard trigger on `client_binance_nicknames`: block/soft-flag attaching a nickname whose resolved userNo conflicts with the userNo(s) already on that client → routes to a review queue instead of silently merging.
4. Harden `auto_sync`/backfill writers to skip name-only attachment and to update (not duplicate) the active nickname on same-userNo rename.

## Notes
- Phases 1–2 are pure reads + a CSV; zero risk. Phase 3 is destructive and runs only on explicit approval, as reviewed migrations.
- All identity derives from synced order detail (+ supported order-detail backfill). No nickname-search API is used or simulated (Binance limitation).
