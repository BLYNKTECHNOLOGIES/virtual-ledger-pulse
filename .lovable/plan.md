# Guarantee a Nickname for Every Binance Order

## What I verified first (not assumed)

You asked me not to trust your framing blindly, so I checked the live database and the sync/enrich code. The real picture is slightly different from "the nickname is lost after 1 hour":

1. **The unmasked nickname IS already being captured within Binance's window.** For the last 35 days, **all 2,178 completed orders have `order_detail_raw` stored, and ZERO of them have a masked nickname inside that detail.** The detail fetch (`c2c/orderMatch/getUserOrderDetail`) is reliably grabbing the real `buyerNickname`/`sellerNickname` while the ~1‑hour window is open.
2. **The nickname is never promoted to the column the approval/resolution logic reads.** The approval screens and `clientIdentityResolver` read `counter_part_nick_name` (and `p2p_order_records.counterparty_nickname`). For **SELL orders and all legacy rows, that column stays masked** (e.g. `Iam***`, `Ash***`) even though the full nickname (`Iam_scorpion_trader`, `Ashu6692`) is sitting right there in `order_detail_raw.buyerNickname`.
3. **Scale of the gap:** **29,925 completed orders** currently have a masked/null `counter_part_nick_name` but already contain the unmasked nickname in `order_detail_raw`. These are recoverable with zero Binance API calls.
4. **Root cause of the leak:** `enrich-order-names` only re-selects rows where `verified_name`, `counterparty_risk_snapshot`, or `order_detail_raw` is null. Once an older enrich run set those (without promoting the SELL nickname), the row is permanently excluded from re-processing, so the masked column is never healed.

**Conclusion:** the problem is a *promotion + self-heal* bug, not an API-window loss. We still add a faster within-window safety net for high-volume hours, but the core fix is cheap and reliable.

## Plan

### 1. One-time backfill (data op, reversible-safe)

Promote the unmasked nickname from `order_detail_raw` into `counter_part_nick_name` for the ~29,925 recoverable completed orders:

- SELL → `order_detail_raw->>'buyerNickname'`, BUY → `order_detail_raw->>'sellerNickname'`.
- Skip our own handles (`BlynkEx`, and the ASEC merchant handle) and anything containing `*`.
- Mirror the value into `p2p_order_records.counterparty_nickname` for the same `binance_order_number`.
- Batched by `create_time` to stay within statement limits.

### 2. Fix `enrich-order-names` to self-heal (edge function)

- Widen the row selection so it ALSO picks completed orders where `counter_part_nick_name` is null/masked but `order_detail_raw` already holds an unmasked nickname — so a masked column is always healed even after verified_name/risk are set.
- Always run the nickname-promotion branch independently of `verified_name` presence.

### 3. Durable nickname registry (new table, your explicit 5‑day requirement)

Create `public.order_nickname_registry`:

- Columns: `order_number` (PK), `exchange_account_id`, `cp_userno`, `nickname`, `verified_name`, `trade_type`, `captured_at`, `expires_at` (default `now() + 5 days`).
- Standard GRANTs + RLS (authenticated read; service_role full).
- Written whenever an unmasked nickname is captured (steps 2 & 4). Acts as a fast, dedicated lookup and an audit trail.
- Daily cron deletes rows past `expires_at` (order_detail_raw keeps the permanent copy, so nothing is truly lost).

### 4. New frequent within-window capture job (edge function `capture-order-nicknames`)

- Runs every 15 minutes (well inside the 1‑hour Binance window — safer than the current hourly enrich for busy hours).
- Selects completed orders from the last ~90 minutes that still lack a promoted unmasked nickname, **with no small batch cap** (processes all such orders, per account, so high-volume hours never starve).
- Per exchange account (Blynk = default, ASEC = acct2) calls `getUserOrderDetail`, extracts the counterparty nickname + verified name, and writes to: `counter_part_nick_name`, `p2p_order_records.counterparty_nickname`, and `order_nickname_registry`.
- Rate-limited (200ms spacing, retry on connection resets) like the existing enrich function.
- Register a `*/15 * * * *` pg_cron job.

### 5. Approval-time guarantee (resolution fallback)

- In the sync/approval nickname resolution, add a fallback chain: `counter_part_nick_name` → `order_nickname_registry.nickname` → `order_detail_raw` unmasked nickname. This ensures an order in approval always resolves against a real nickname, even mid-capture.
- No change to the identity-resolution safety rules established earlier (bare name matches still don't auto-link; nickname→client linkage remains the trusted key).

## Technical notes

- Files: `supabase/functions/enrich-order-names/index.ts` (fix), new `supabase/functions/capture-order-nicknames/index.ts`, new migration (registry table + GRANTs + RLS + cron), backfill via the data/insert tool, and a small resolver fallback in `src/hooks/useTerminalSalesSync.ts` / `useTerminalPurchaseSync.ts` / approval dialog.
- "Our own" handles are detected via the merchant/taker `merchantNo`/`takerUserNo` ownership already used to build `cp_order_identity`, so we never mistake `BlynkEx`/ASEC for a client.
- Everything is additive; no destructive changes to existing order or client data.

## Open question

Binance exposes the nickname for roughly one hour after completion. A 15‑minute job gives 3–4 attempts inside that window — do you want that cadence, or should I make it every 10 minutes for extra margin during peak volume? Keep it 30 min