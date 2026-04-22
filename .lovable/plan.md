

## Goal

Bring the **bank ledger** to the same immutability standard as the wallet ledger:
- Every settled bank transaction is **append-only**, hash-chained, with stamped `balance_before` / `balance_after` per `bank_account_id`.
- All "reversals" (settlement reversal, sales/purchase delete, transfer undo, expense delete) stop deleting rows and instead **post a counter-entry** linked back to the original — so the running balance always lands at the right number, the audit trail stays intact, and a "Hide reversal noise" toggle can present a clean statement.
- **Pending settlements stay outside the ledger.** Only when a sale is *settled to bank* does it produce a `bank_transactions` row (already true today; we only enforce it never gets erased).

## Findings (current state)

- `bank_transactions` has **no triggers, no balance fields, no sequence, no hash chain**. `bank_accounts.balance` is a derived cache from `get_bank_calculated_balances()` (sum of all rows).
- **Today's "reversal" pattern is hard delete**, in 3+ paths:
  - `reverse_payment_gateway_settlement` → `DELETE FROM bank_transactions WHERE reference_number = batch_id`
  - `TransferHistory.tsx` → `.delete()` on `TRANSFER_OUT` / `TRANSFER_IN` pairs
  - `ExpensesIncomesTab.tsx` → `.delete()` on expense rows
  - Sales/purchase delete flows → cascade or app-side delete of the linked bank row
- Inserts originate from: settlement RPC, small-buy/small-sale/terminal/edit/manual sales dialogs, small-buy gateway-fee dialog, tax-management TDS payment, transfer form. All are honest inserts; no balance stamping.
- `enforce_bank_balance_from_ledger` already auto-corrects `bank_accounts.balance` to the calculated sum, so we have a clean reconciliation surface.

## Design

### Part 1 — Schema additions to `bank_transactions`

Add (nullable initially, backfilled, then NOT NULL where applicable):
- `sequence_no BIGINT` — monotonic per-row, globally ordered (one sequence shared across all bank accounts; per-account ordering derived via index).
- `balance_before NUMERIC` — stamped at insert time, **per `bank_account_id`**.
- `balance_after NUMERIC` — same.
- `prev_hash TEXT`, `row_hash TEXT` — hash chain over `(id, bank_account_id, transaction_type, amount, balance_before, balance_after, sequence_no, prev_hash, transaction_date, reference_number)`.
- `is_reversed BOOLEAN DEFAULT false` — set TRUE on the *original* when a reversal posts.
- `reverses_transaction_id UUID REFERENCES bank_transactions(id)` — set on the *reversal* row, points to the original.
- `reversal_reason TEXT` — captured for audit.

Indexes: `(bank_account_id, sequence_no)`, `(reverses_transaction_id)`, partial `(reverses_transaction_id) WHERE reverses_transaction_id IS NOT NULL`.

### Part 2 — Append-only enforcement (mirrors wallet pattern)

- **`set_bank_transaction_balances` (BEFORE INSERT)** — locks `bank_accounts` row, reads current calculated balance for that account, computes and stamps `balance_before` / `balance_after`, assigns next `sequence_no`, computes `prev_hash` (last row's `row_hash` for that account, or genesis), computes `row_hash`. Callers may pass `0` / `undefined` for the balance fields — trigger always overwrites.
- **`block_bank_transaction_mutation` (BEFORE UPDATE OR DELETE)** — raises EXCEPTION except for an allow-list of metadata-only updates (`bill_url`, `category`, `description` — never amount/account/type/date/balance fields). DELETE is fully blocked. Logs every attempted violation to a new `bank_ledger_tamper_log` table (mirrors wallet tamper log).
- **No CASCADE deletes** can touch `bank_transactions`. Audit and convert any FK from `sales_orders` / `purchase_orders` / `payment_gateway_settlements` / etc. that references `bank_transactions` to `NO ACTION`. (Today the linkage is by `reference_number` text, not FK, so this is mostly defensive.)

### Part 3 — Reversal RPC: `reverse_bank_transaction`

Single source of truth for any "undo":
```text
reverse_bank_transaction(p_original_id, p_reason, p_reversed_by) → uuid (new reversal row id)
```
- Idempotency: `INSERT ... ON CONFLICT DO NOTHING` into `reversal_guards (entity_type='bank_transaction', entity_id=p_original_id, action='reverse')`. Second call is a no-op.
- Loads the original row `FOR UPDATE`. Refuses if `is_reversed = true` or if the row itself is a reversal.
- Posts a **new** `bank_transactions` row with:
  - `transaction_type` flipped (`INCOME ↔ EXPENSE`, `TRANSFER_IN ↔ TRANSFER_OUT`)
  - same `amount`, same `bank_account_id`
  - `transaction_date = CURRENT_DATE` (audit reality, not original date)
  - `description = 'Reversal of <orig_id> — <reason> [REV:<short_orig_id>]'`
  - `reverses_transaction_id = p_original_id`
  - `reversal_reason = p_reason`
- Sets `is_reversed = true` on the original via the **only** allowed metadata path (whitelisted in the mutation-block trigger).
- The append-only INSERT trigger automatically stamps `balance_before/after` so the running balance lands correctly.

### Part 4 — Refactor every existing delete path to use the RPC

| Path | Today | After |
|------|-------|-------|
| `reverse_payment_gateway_settlement` RPC | `DELETE FROM bank_transactions WHERE reference_number = batch_id` (gross + MDR) | Look up the two rows by `reference_number`, call `reverse_bank_transaction` for each |
| `TransferHistory.tsx` | `.delete()` of TRANSFER_OUT + TRANSFER_IN | Call `reverse_bank_transaction` on both legs (stays linked via `reverses_transaction_id`) |
| `ExpensesIncomesTab.tsx` | `.delete()` of expense | Replace with confirmation → `reverse_bank_transaction` |
| Sales delete (`StepBySalesFlow`, `EditSalesOrderDialog` cancel paths) | implicit cleanup of linked bank row | If the linked bank row exists, reverse it via RPC; never delete |
| Purchase delete | same pattern | same pattern |

Settlement reversal in particular **must stop deleting** the gross-INCOME and MDR-EXPENSE rows. Instead it posts two reversal rows, restores `pending_settlements`, marks the settlement as REVERSED. The audit trail then shows: original credit → reversal debit → next batch credit. Net balance impact identical, history preserved.

### Part 5 — Pending settlements remain off-ledger

No schema changes to `pending_settlements`. They are intent records, not ledger entries. The first time a row enters `bank_transactions` is when `process_payment_gateway_settlement` runs (gateway sales) or when `create_sales_bank_transaction` trigger fires (direct-bank sales). This already matches the user's intent — pending ≠ settled.

### Part 6 — Verifier RPCs (for the Ledger Integrity tab)

- `verify_bank_chain()` — walks all bank rows in `(bank_account_id, sequence_no)` order, recomputes each `row_hash`, asserts `prev_hash` linkage. Returns first break or "intact".
- `verify_bank_running_balance(p_bank_account_id)` — asserts `row.balance_after == row.balance_before + signed_amount` and `row.balance_before == previous_row.balance_after` per account. Mirrors `verify_wallet_asset_running_balance`.
- `verify_all_bank_running_balances()` — one row per bank account.

### Part 7 — UI

- **`LedgerIntegrityTab.tsx`** — add a new "Bank Ledger" section with two buttons mirroring the wallet ones: "Verify Bank Hash Chain" and "Verify Bank Running Balances". Remove the "bank_transactions is not yet immutable" v2 disclaimer.
- **`ExpensesIncomesTab.tsx` / `BankJournalEntries`** — show `ReversalBadge` (reuse the wallet-side component, generalize props) on each row using `is_reversed` / `reverses_transaction_id`. Add the **"Hide reversal noise"** toggle (persisted via the same `useTerminalUserPrefs` key family, e.g. `bankLedger.hideReversalNoise`).
- **Delete buttons** in `ExpensesIncomesTab` and `TransferHistory` change label/intent: "Delete" → "Reverse" with an `AlertDialog` capturing the reason (mandatory text field).

### Part 8 — Backfill (one-time migration)

For the existing 3,796 rows:
1. Assign `sequence_no` in `(bank_account_id, transaction_date, created_at, id)` order using a single window function.
2. Walk per `bank_account_id` in sequence order, compute and stamp `balance_before` / `balance_after` from a running sum.
3. Compute `prev_hash` / `row_hash` chain.
4. Mark `is_reversed` for any historical rows that were previously deleted-then-re-added: detect by matching `reference_number` pairs that net to zero on the same account; flag both sides via `reverses_transaction_id`. For settlement reversals where the original row was already deleted, we cannot retroactively restore it — backfill leaves those untouched and the integrity tab will report them honestly.
5. Verify chain end-to-end before adding the mutation-block trigger. If verification fails, the migration aborts.

### Part 9 — Rollout order (single migration C-bank, then app changes)

1. **Migration**: schema additions → backfill → enable INSERT trigger → enable mutation-block trigger → add tamper log → add reversal RPC → add verifier RPCs.
2. **App refactor** in this order so nothing breaks mid-deploy:
   - `reverse_payment_gateway_settlement` switched to RPC-based reversal.
   - `TransferHistory.tsx` switched to RPC.
   - `ExpensesIncomesTab.tsx` "Delete" → "Reverse" flow.
   - Sales/purchase delete paths audited; any direct `bank_transactions` delete replaced with reversal call.
   - `LedgerIntegrityTab` extended.
   - Add `ReversalBadge` + simplified-view toggle to bank journal lists.
3. **Smoke tests**: settle a batch, reverse it, verify chain stays intact, verify running balance reconciles, verify UI shows linked pair, verify simplified view hides both rows.

## Out of scope (deferred)

- External anchoring of `bank_transactions` head hash (publish to public chain) — separate v2.
- Migrating historical orphan deletions (where the deleted row is already gone) into reconstructed rows — left as honest gaps reported by the verifier.
- Any change to the off-ledger `pending_settlements` lifecycle.

## Risks / mitigations

- **Risk**: backfill mis-orders rows that share `transaction_date` and were inserted in a different real-world order. **Mitigation**: tie-break uses `created_at`, then `id`; result is deterministic and auditable; verifier reports any inconsistency before locking.
- **Risk**: an existing app path silently relies on a hard delete and will throw under the new mutation-block. **Mitigation**: refactor all 5 known call sites in lockstep with the migration; mutation-block raises a clear, actionable error message ("Use reverse_bank_transaction RPC instead") so any missed path surfaces immediately.
- **Risk**: settlement reversal previously netted to zero by deleting two rows now nets to zero by adding two reversal rows — `bank_accounts.balance` cache stays correct because `enforce_bank_balance_from_ledger` re-derives from the ledger sum.

