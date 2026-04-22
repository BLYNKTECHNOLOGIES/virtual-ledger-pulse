

## Goal

Convert the stock/wallet ledger (`wallet_transactions` and related tables) into an append-only, tamper-evident, blockchain-style log. Once a row is written, it can never be edited or deleted — a "reversal" or "correction" is itself a new transaction that points at the original. Any attempt to mutate history (via app, RPC, SQL editor, or compromised role) is either blocked or detectable.

## The 5 Pillars

1. **Append-only enforcement** — DB triggers reject `UPDATE` and `DELETE` on `wallet_transactions` for everyone (including service role on most paths). Inserts only.
2. **Hash chain (Merkle-style linkage)** — every row carries `row_hash` = SHA256(canonical-payload + previous_row_hash). Tampering one row breaks every subsequent hash.
3. **Reversal-as-new-row** — replace the existing `delete_wallet_transaction_with_reversal` with `reverse_wallet_transaction`, which inserts an opposite-sign row tagged `REVERSAL_OF: <original_id>`. Original stays forever.
4. **Periodic anchoring + verification** — a daily job computes the chain head hash, stores it in a separate `ledger_anchors` table (also append-only), and exposes a "Verify Chain" admin tool that walks the chain and flags any break.
5. **Migration of historic rows** — backfill `row_hash`/`prev_hash` for all existing transactions in chronological order so the chain starts clean from day one.

## Schema Changes

**`wallet_transactions` — add columns**
- `prev_hash text` — hash of the immediately preceding row (per-wallet chain)
- `row_hash text NOT NULL` — SHA256 of this row's canonical payload + `prev_hash`
- `sequence_no bigint` — per-wallet monotonic counter
- `reverses_transaction_id uuid` — points at the original row when this entry is a reversal
- `is_reversed boolean default false` — marked true on the original when a reversal posts (informational only; no data is changed apart from this flag, which itself is hashed-excluded)

**New table `ledger_anchors`** (append-only)
- `id`, `anchored_at`, `wallet_id` (nullable = global), `head_sequence_no`, `head_row_hash`, `tx_count`, `anchored_by`

**New table `ledger_tamper_log`** (append-only)
- Records any attempted UPDATE/DELETE on `wallet_transactions`: who, when, which row, old vs attempted new payload. Even a blocked attempt leaves a footprint.

## Triggers & Functions

1. `trg_wallet_tx_block_mutation` — `BEFORE UPDATE OR DELETE ON wallet_transactions`: writes to `ledger_tamper_log` and raises exception. Only exception: a single allowed UPDATE path that sets `is_reversed=true` via a SECURITY DEFINER function called from `reverse_wallet_transaction` (and that update is itself logged).
2. `trg_wallet_tx_hash_chain` — `BEFORE INSERT`: locks the wallet's chain head, assigns `sequence_no = head+1`, sets `prev_hash = head.row_hash`, computes `row_hash`. Uses `pg_advisory_xact_lock(hashtext(wallet_id::text))` to serialize concurrent inserts per wallet.
3. `reverse_wallet_transaction(p_tx_id uuid, p_reason text, p_reversed_by uuid)` — SECURITY DEFINER. Loads original, inserts opposite-sign row with `reverses_transaction_id = p_tx_id` and `reference_type = 'REVERSAL'`, marks original `is_reversed = true`. Idempotent via partial unique index `(reverses_transaction_id) WHERE reverses_transaction_id IS NOT NULL`.
4. `verify_wallet_chain(p_wallet_id uuid DEFAULT NULL)` — walks rows in `sequence_no` order, recomputes hashes, returns first break (if any) with row id, expected vs actual hash.
5. `snapshot_ledger_anchor()` — daily cron (pg_cron) that records current chain head per wallet into `ledger_anchors`.

## App-Layer Changes

- **Replace** every call site of `delete_wallet_transaction_with_reversal` (StockTransactionsTab, WalletManagementTab) with `reverse_wallet_transaction` — UI now says "Reverse" instead of "Delete", asks for a reason via `AlertDialog`, and shows both rows side-by-side after.
- **Stock Management → new tab "Ledger Integrity"** (Super Admin / Auditor only): button "Run Chain Verification", shows last anchor, last verification result, count of tamper-log entries.
- **Transactions list**: visually link reversal pairs (badge "Reversed by →" on original, "Reverses ←" on the new row). Originals are never hidden.

## Problems Anticipated & Mitigations

| Risk | Mitigation |
|---|---|
| Triggers that recompute balances currently use `AFTER INSERT OR DELETE OR UPDATE` — once DELETE/UPDATE are blocked, only INSERT path matters. Need to confirm `update_wallet_balance` works correctly when only INSERT fires (it already does for normal inserts). | Audit and simplify `update_wallet_balance` to insert-only branch. Reversals naturally produce correct `wallet_asset_balances` via the new opposite-sign INSERT. |
| Existing migrations or one-off cleanups sometimes `DELETE FROM wallet_transactions`. | Provide a `SET LOCAL app.allow_ledger_mutation = 'on'` escape hatch the trigger checks; only set inside explicitly named maintenance migrations, and every such use writes to `ledger_tamper_log` with reason. No application code path can set it. |
| Hash-chain serialization could slow high-throughput wallets. | Per-wallet advisory lock (not table-wide). Hash compute is in-memory SHA256 — sub-millisecond. |
| Concurrent inserts racing on `sequence_no`. | Advisory lock per wallet inside BEFORE INSERT trigger guarantees ordering. |
| Backfilling hashes on existing rows. | One-time migration: order by `(wallet_id, created_at, id)`, walk and populate `sequence_no`, `prev_hash`, `row_hash`. Then add `NOT NULL` constraints. |
| Reversals of reversals (operator clicks twice). | Partial unique index on `reverses_transaction_id` blocks double-reversal; the existing system-wide double-reversal-prevention pattern (memory) already follows this. |
| Reference tables (`purchase_orders`, `sales_orders`, `wallet_asset_balances`) are still mutable. | Out of scope for v1 — the **ledger** is the truth. Higher tables can change, but every monetary effect is in the immutable ledger. v2 can extend the same pattern to `wallet_asset_balances` history. |
| Service role / SQL editor can still bypass triggers via `ALTER TABLE DISABLE TRIGGER`. | Cannot fully prevent at DB level if attacker has superuser. But: (a) the hash chain makes any silent edit instantly detectable, (b) `ledger_anchors` daily snapshot is an external witness, (c) supabase audit log records DDL. Document this honestly. |
| RLS is currently wide-open (`ALL true`). | Tighten: `INSERT` allowed for authenticated; `UPDATE`/`DELETE` denied for everyone (defense in depth on top of triggers). |
| UI deletion buttons across other modules (purchase order delete, sales order delete) might cascade-delete ledger rows via FK. | Audit FKs on `wallet_transactions.reference_id` — they should be `ON DELETE NO ACTION`, not `CASCADE`. Force callers to reverse instead. |

## Rollout Plan

**Phase 1 — Schema & backfill (1 migration)**
Add columns + tables, backfill hashes, add NOT NULLs, create `ledger_anchors`, `ledger_tamper_log`.

**Phase 2 — Triggers & RPCs (1 migration)**
Hash-chain trigger, mutation-block trigger, `reverse_wallet_transaction`, `verify_wallet_chain`, `snapshot_ledger_anchor` + pg_cron daily.

**Phase 3 — App swap**
Replace deletion call sites with reversal flow. Update UI labels, add reason dialog, add reversal badges.

**Phase 4 — Ledger Integrity admin tab**
Verification button, anchor history, tamper-log viewer.

**Phase 5 — Tighten RLS + audit FKs**
Lock down UPDATE/DELETE policies. Convert any `ON DELETE CASCADE` referencing the ledger to `NO ACTION`.

## Out of Scope (call out explicitly)

- Making `wallet_asset_balances`, `purchase_orders`, `sales_orders` themselves immutable — they remain mutable working tables; the ledger is the authoritative immutable record.
- External blockchain anchoring (e.g. publishing chain head to Bitcoin/Ethereum). Can be a Phase 6 if desired — would only need to extend `snapshot_ledger_anchor` to push the head hash to an external chain.

