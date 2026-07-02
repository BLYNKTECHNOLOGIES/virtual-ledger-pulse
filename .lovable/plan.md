# Credit Sub-Ledger — Logical Gap Analysis & Fixes

I audited the whole sub-ledger path: entry forms, the reassign flow, the append-only hash-chain triggers on `bank_transactions`, the transfer RPC, and the reversal RPC. The core promise of the feature is: **the sum of all sub-ledgers must always equal the credit account balance**. Several gaps break that promise. Ordered by severity.

## Gap 1 — Reversals corrupt the sub-ledger total (CRITICAL)

`reverse_bank_transaction()` posts a counter-row with the **opposite** transaction type, `is_reversed = false`, and **`sub_ledger_id = NULL`** (it never copies it). The original is flagged `is_reversed = true`.

`CreditSubLedgerDialog` filters **only** `is_reversed = false`. So on a reversed credit-account transaction:
- The original (correctly) drops out.
- The counter-row (opposite sign, no sub-ledger) is **still counted**, landing in "Unidentified".

Result: after any reversal on a credit account, a phantom balance appears under "Unidentified" and the **sub-ledger total no longer equals the account balance**. `AccountSummary` avoids this by excluding both reversed originals *and* counter-rows (`reverses_transaction_id IS NULL`); the dialog does not.

**Fix**
- In the dialog query, add `.is('reverses_transaction_id', null)` so reversed pairs net to zero — matching `AccountSummary`'s exact live-entry rule. This alone restores reconciliation.
- Additionally, make `reverse_bank_transaction()` copy `sub_ledger_id` onto the counter-row, so drill-downs stay person-correct if reversals are ever displayed.

## Gap 2 — Sign convention doesn't match the balance engine

The dialog signs with `POSITIVE_TYPES = [INCOME, CREDIT, TRANSFER_IN]`. But the actual balance trigger `update_bank_account_balance()` only recognizes `INCOME`/`TRANSFER_IN` (+) and `EXPENSE`/`TRANSFER_OUT` (−); a `CREDIT`/`DEBIT` type is **skipped with a warning** (no balance effect). So if any credit-account row ever uses type `CREDIT`/`DEBIT`, the dialog counts it while the account balance does not → mismatch.

**Fix**
- Change `signedAmount()` to mirror the trigger exactly: `INCOME`/`TRANSFER_IN` → `+amount`, `EXPENSE`/`TRANSFER_OUT` → `−amount`, anything else → `0`. This guarantees the sub-ledger math can never diverge from the balance engine.

## Gap 3 — Sales / Purchase / sync postings bypass the mandatory rule

Mandatory sub-ledger selection is enforced only in the manual journal, transfer, expense-edit, and balance-adjustment forms. Credit postings from sales, purchase, and Binance sync write `sub_ledger_id = NULL` → everything lands in "Unidentified". This contradicts the "every form where a credit account is selected" requirement.

**Fix**
- Add `SubLedgerSelect` to the manual sales and purchase entry dialogs, shown only when the chosen payment method resolves to a `CREDIT` `bank_account_id`, and thread `sub_ledger_id` through their insert paths (mandatory before save).
- Automated sync postings have no operator; leave them in "Unidentified" and surface a badge/count so they can be reassigned from the credit-account view. (No entry-time prompt in the sync money path — too risky.)

## Gap 4 — Reassign safety: permission + no-op balance re-check

`reassign` does a raw `UPDATE` on `bank_transactions`. It passes the append-only trigger (changing only `sub_ledger_id` counts as an allowed metadata update), but:
- It has **no `bams_manage` permission gate** — any authenticated user can move balances between people.
- The `UPDATE` also fires `check_bank_balance_before_transaction` and `update_bank_account_balance`; since type/amount/account are unchanged these must be verified to be true no-ops (the balance trigger reverses-then-reapplies to net zero) and not spuriously block an `EXPENSE` row when the account is low.

**Fix**
- Gate the reassign control behind the same `bams_manage` permission used elsewhere.
- Confirm the balance-check trigger short-circuits when `amount`/`type`/`account` are unchanged; if not, add that guard.

## Gap 5 — Deleting a sub-ledger that still holds transactions

`bank_transactions.sub_ledger_id` FK has no `ON DELETE` behavior, but the UI offers delete for any non-system sub-ledger. Deleting one that is still referenced throws a raw FK error; if it ever succeeded it would orphan rows.

**Fix**
- Block deletion when the sub-ledger is referenced (friendly message), or require reassigning its transactions to "Unidentified" first. Prefer surfacing **deactivate** (`is_active = false`, already supported) as the primary action, keeping historical rows intact.

## Gap 6 — Minor: sub-ledger creator audit

`useCreateSubLedger` falls back to `created_by = NULL` when `user.id` isn't a UUID, silently dropping the creator. Low impact; note only.

---

## Technical summary of changes

```text
DB (migration):
  - reverse_bank_transaction(): copy sub_ledger_id onto counter-row
  - (verify) check_bank_balance_before_transaction: no-op on unchanged amount/type/account

Frontend:
  - CreditSubLedgerDialog.tsx
      * query: add .is('reverses_transaction_id', null)   (Gap 1)
      * signedAmount(): mirror balance trigger exactly      (Gap 2)
      * reassign: gate behind bams_manage permission        (Gap 4)
      * delete: guard/deactivate when referenced            (Gap 5)
  - Manual Sales & Purchase entry dialogs                    (Gap 3)
      * SubLedgerSelect when payment method → CREDIT account
      * thread sub_ledger_id into inserts, mandatory
  - useCreditSubLedgers.ts: keep creator when UUID present   (Gap 6, optional)
```

Guarantees preserved: no change to account balance math, the append-only hash chain, tamper log, statistics, or reporting. The only behavioral change is that the sub-ledger breakdown now reconciles exactly to the account balance in every case, and credit postings from more entry points carry a person.

I recommend implementing **Gaps 1 and 2 first** (pure reconciliation correctness, low risk), then 3–5. Want me to proceed with all of them, or just the critical reconciliation fixes first?
