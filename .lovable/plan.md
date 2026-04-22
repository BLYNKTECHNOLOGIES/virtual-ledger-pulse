

# Bank Ledger Immutability — Gap Audit & Hardening Plan

## Summary of audit

The DB layer is solid:
- All 3,796 rows have `sequence_no`, `balance_before/after`, `row_hash`.
- Mutation-block trigger is live; `bank_ledger_tamper_log` exists.
- Only 3 functions still touch the table: `reverse_bank_transaction` (writer), `delete_user_with_cleanup` (whitelisted UPDATE of `created_by`), `create_bank_transfer` (INSERT). Server-side `DELETE`s are gone.
- 0 reversal rows in the table today → **the new reversal flow has never fired against real data**, so any client path that still tries to delete/update will throw the moment a user clicks it.

The audit found **3 client-side files still mutating `bank_transactions` directly** that the plan missed, plus 2 secondary risks.

## Confirmed gaps (will throw under live triggers)

### Gap 1 — `EditSalesOrderDialog.tsx` (CRITICAL)

Lines 322-326 and 394-398 still execute:
```ts
await supabase.from('bank_transactions').delete()
  .eq('reference_number', order.order_number)
  .eq('transaction_type', 'INCOME');
```

These run when:
- (line 322) a completed split-payment sales order is edited.
- (line 394) a sales order is switched from split → single payment.

Both will hit `block_bank_transaction_mutation` and abort the entire edit, leaving `sales_order_payment_splits` and `pending_settlements` half-deleted (they get deleted *before* the bank delete, so the order's payment record gets corrupted on failure).

### Gap 2 — `EditExpenseDialog.tsx` (CRITICAL)

Lines 105-116 do a wholesale `UPDATE` of `bank_account_id`, `transaction_type`, `amount`, `transaction_date`, `reference_number` — every one of which is on the trigger's blocked-fields list. Editing any expense from the BAMS journal currently throws.

### Gap 3 — `delete_user_with_cleanup` migration (LOW)

The DB function nullifies `created_by` on `bank_transactions`. The mutation-block trigger's whitelist needs to explicitly allow `created_by` updates (or this RPC will break user deletion). Audit confirms the trigger currently allows only `bill_url`, `category`, `description`, `is_reversed` — so `created_by` updates are blocked. User deletion will fail.

## Secondary risks (not throws, but behavioral)

### Risk A — Edit flows mix RPC + raw SQL

`EditSalesOrderDialog` already calls `reconcile_sales_order_edit` and `handle_sales_order_payment_method_change` (which were correctly refactored DB-side). But the split-handling block (lines 320-413) bypasses them entirely and rewrites bank rows by hand. This is both a correctness gap (no idempotency, no reversal linkage) and a duplication of logic.

### Risk B — Zero reversal rows in production

`bank_transactions.reverses_transaction_id` count = 0. None of the refactored paths have run end-to-end. We should smoke-test each path (settlement reversal, transfer undo, expense reverse, sales delete, purchase delete, sales/purchase edit, payment-method change) and confirm the chain stays intact.

### Risk C — Edge functions

Searched all of `supabase/functions/` — no edge function writes to `bank_transactions`. Clean.

## Plan

### Phase 1 — Fix the 3 client-side blockers (CRITICAL)

**1a. `EditSalesOrderDialog.tsx` split-payment block (lines 320-413)**

Replace both `bank_transactions.delete()` calls with a loop that calls the existing `reverse_bank_transaction` RPC for each matching row, then proceed with the rest of the existing flow unchanged:

```ts
const { data: oldTxs } = await supabase
  .from('bank_transactions')
  .select('id')
  .eq('reference_number', order.order_number)
  .eq('transaction_type', 'INCOME')
  .eq('is_reversed', false)
  .is('reverses_transaction_id', null);

for (const t of oldTxs ?? []) {
  await supabase.rpc('reverse_bank_transaction', {
    p_original_id: t.id,
    p_reason: isMultiplePayments
      ? `Sales order edited: split payment restructure`
      : `Sales order edited: split→single conversion`,
  });
}
```

Apply the same pattern at line 394. Order of operations stays: reverse bank rows → delete `pending_settlements` → delete `sales_order_payment_splits` → re-insert new splits + bank rows (the existing INSERTs at lines 371-380 already work fine; trigger stamps them).

**1b. `EditExpenseDialog.tsx` (lines 96-137)**

Replace the in-place `.update()` with a reverse-then-reinsert pattern:

```ts
// 1. Reverse the original (posts a counter-entry, marks original is_reversed)
await supabase.rpc('reverse_bank_transaction', {
  p_original_id: transaction.id,
  p_reason: `Edited via expense dialog`,
});

// 2. Insert the new version (trigger stamps balance + chain)
await supabase.from('bank_transactions').insert({
  bank_account_id: formData.bankAccountId,
  transaction_type: formData.transactionType,
  amount: parseFloat(formData.amount),
  category: categoryLabel,
  description: formData.description || null,
  transaction_date: format(formData.date, 'yyyy-MM-dd'),
  reference_number: formData.referenceNumber || null,
  related_account_name: transaction.related_account_name ?? null,
});
```

Update the dialog header copy from "Edit Transaction" to "Edit (posts a reversal + new entry)" so users understand the immutability semantics. Editing only `description` / `category` could optionally stay as a real `.update()` because those are whitelisted — but cleaner to always go via reverse+reinsert for predictability.

**1c. `delete_user_with_cleanup` whitelist patch (DB migration)**

Extend the mutation-block trigger's allow-list to permit nullifying `created_by` (and only that column) when no other field changes. Alternatively, make `delete_user_with_cleanup` set a session GUC (`set_config('app.bypass_bank_immutability', 'true', true)`) that the trigger respects, scoped to that one transaction. The GUC approach is preferred — it keeps the field-level whitelist tight.

### Phase 2 — Consolidate the edit flow (Risk A)

Move the split-payment logic that lives in `EditSalesOrderDialog.tsx` (lines 320-413) into `reconcile_sales_order_edit` so the dialog calls one RPC and the DB owns all bank-row manipulation. This removes the last raw bank writes from the sales path. Same treatment for the equivalent block in `EditPurchaseOrderDialog` if any survives (audit shows it's already RPC-only — verify).

### Phase 3 — Smoke test & verify (Risk B)

Run, in order, against a sandbox dataset:

1. Manual expense → edit → confirm 1 original flagged `is_reversed`, 1 reversal row, 1 fresh insert; chain intact.
2. Bank transfer → reverse via TransferHistory → 2 reversal rows linked to 2 originals.
3. Settlement → reverse → 2 reversal rows (gross + MDR), `pending_settlements` restored.
4. Sales order with single direct-bank payment → delete → 1 reversal row.
5. Sales order with split (gateway + direct) → edit splits → reversal rows for old direct legs, gateway legs untouched (gateway lives in `pending_settlements`).
6. Sales order split → single conversion → reversal rows for split legs, new single INCOME row.
7. Purchase order → delete → reversal row(s).
8. After each: `SELECT * FROM verify_bank_chain()` — must return all accounts intact. `SELECT * FROM verify_all_bank_running_balances()` — zero drift.
9. Confirm `bank_accounts.balance` cache equals SUM of ledger via `enforce_bank_balance_from_ledger`.

### Phase 4 — Defensive guardrails

- Add a CI/lint regex check (or simple `grep` in `package.json` script) that fails the build if any `.ts/.tsx` file outside `reverse_bank_transaction` callers contains `from('bank_transactions').delete(` or `from('bank_transactions').update(`. Prevents regression.
- Surface `bank_ledger_tamper_log` in the Ledger Integrity tab (last 50 attempts, with table/operation/blocked-by-trigger reason). Currently the table exists but nothing reads it.

## Out-of-scope items (and what they mean for the future)

| Item | What it means | Future risk |
|---|---|---|
| External hash anchoring | Publishing the ledger head hash to a public chain (e.g. daily commit to a public bucket or blockchain) so tampering by a DB superuser is detectable by outsiders. | Low until an external auditor/regulator demands cryptographic proof of non-tampering. Today only insider-with-superuser can rewrite history; the tamper log catches application-level attempts. |
| Reconstruction of pre-immutability deletes | Historical rows that were hard-deleted before the trigger went live cannot be rebuilt — the source data is gone. | None to current operations. The verifier reports honest gaps; document the cutover date so auditors know the chain is authoritative only from that date forward. |
| `pending_settlements` mutability | Pending settlements remain mutable because they represent intent (gateway has the money, bank doesn't yet). They become ledger reality only when `process_payment_gateway_settlement` posts a `bank_transactions` row. | None — this is by design and matches the user's "only settled = ledger" intent. If a future requirement demands an audit trail of pending-state changes, add a separate `pending_settlements_audit` table; do not promote pending into the immutable ledger. |

## Risks / mitigations

- **Risk:** Phase 1b changes the user-visible behavior of "Edit Expense" — users will now see two extra rows in the journal (original + reversal) where today they see one updated row. **Mitigation:** the existing `hideReversalNoise` toggle (already shipped) hides them; default it to ON for first-time users so the journal looks unchanged.
- **Risk:** Phase 1a runs many sequential RPC calls inside a client mutation; if the browser closes mid-loop, the order ends up with partial reversals. **Mitigation:** wrap the whole reconcile in a single SECURITY DEFINER RPC (Phase 2) so it's atomic in one DB transaction.
- **Risk:** Phase 1c's GUC bypass could be misused. **Mitigation:** only `delete_user_with_cleanup` (SECURITY DEFINER, restricted execute grant) sets it; the trigger checks it AND verifies the only changed column is `created_by`.

