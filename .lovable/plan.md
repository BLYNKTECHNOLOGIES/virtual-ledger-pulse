# Credit Account Sub-Ledger System (BAMS)

## Goal
Track person-wise credit balances *inside* an existing CREDIT bank account, without creating multiple accounts. The credit account keeps working exactly as today for every balance, statistic, and report. Sub-ledgers only add a breakdown layer: the account balance stays the accumulated net, and equals the sum of all its sub-ledger balances.

Sign convention (unchanged, mirrored at sub-ledger level):
- Positive = credit given by us to that person (they owe us)
- Negative = credit taken by us from that person (we owe them)

## Confirmed decisions
- Sub-ledgers are a **shared master list** of persons, reusable across all credit accounts.
- Selecting a sub-ledger is **mandatory** whenever a CREDIT account is chosen on any form.
- Applies to journal, contra, expense/income **and** sales/purchase flows that land on a credit account.
- Legacy balance goes to an **"Unidentified"** sub-ledger and stays **re-assignable** later.

## Data model (migration)

New table `public.credit_sub_ledgers` (shared master list):
- `name` (unique, case-insensitive), `notes`, `is_active`, standard id/timestamps/created_by.
- Seed one row `Unidentified` (system row, cannot be deleted/renamed).
- Full GRANTs (authenticated + service_role) and RLS (authenticated read/write, block delete of system row via trigger).

Alter `public.bank_transactions`:
- Add `sub_ledger_id uuid NULL` referencing `credit_sub_ledgers(id)`.
- Nullable so non-credit transactions are unaffected; a credit-account transaction with `NULL` is treated as **Unidentified** at read time (no forced backfill; balances still reconcile).

No triggers/aggregation changes: the account balance trigger stays untouched. Sub-ledger balances are **derived** (sum of signed amounts of that account's transactions grouped by `sub_ledger_id`), so total always equals the account balance.

## Reusable UI component
`SubLedgerSelect` (searchable combobox):
- Renders **only** when the resolved bank account's `account_type === 'CREDIT'`.
- Lists active sub-ledgers, supports type-to-search, and an inline **"+ Create new sub-ledger"** action that inserts a new person and auto-selects it — all without leaving the form.
- Marks the field required; parent forms block submit if a credit account is selected but no sub-ledger chosen.

## Form integrations (attach `sub_ledger_id` on insert + mandatory validation)
Detect credit account wherever a bank account is resolved and show the selector:
- `journal/components/TransactionForm.tsx` (expense/income)
- `journal/components/TransferForm.tsx` (contra — only the credit side leg)
- `journal/ContraEntriesTab.tsx`
- `journal/components/EditExpenseDialog.tsx` (edit path)
- `ManualBalanceAdjustmentDialog.tsx`
- Sales: `SalesEntryDialog.tsx`, `StepBySalesFlow.tsx`, `EditSalesOrderDialog.tsx`, `OrderCompletionForm.tsx`, `TerminalSalesApprovalDialog.tsx`, `SmallSalesApprovalDialog.tsx`
- Purchase: `CompletedPurchaseOrders.tsx`, `EditPurchaseOrderDialog.tsx`, `SmallBuysApprovalDialog.tsx`

In sales/purchase the account is picked via a payment method → `bank_account_id`; when that resolves to a CREDIT account, the sub-ledger prompt appears before the entry is written to `bank_transactions`.

## Credit account view (BAMS)
In `AccountSummary.tsx`, for CREDIT accounts add a **"View Sub-Ledgers"** action opening a dialog that shows:
- Each sub-ledger with its net balance, colored green (given / positive) vs red (taken / negative), plus a header total that matches the account balance.
- Drill into a sub-ledger to see its transactions.
- **Re-assign** action to move a transaction (e.g. from Unidentified) to another sub-ledger — updates only `sub_ledger_id`, never amounts, so balances shift between sub-ledgers while the account total is unchanged.

## Guarantees / non-goals
- No change to account balance math, tamper log, statistics, P&L, or any report — those keep reading the main account balance.
- Sub-ledgers are additive metadata only; removing them would leave all existing calculations intact.
- No new BAMS accounts are created; everything stays within the single credit account.

## Technical notes
- Balance sign per transaction uses the existing rule already in `AccountSummary` (`INCOME`/`CREDIT`/`TRANSFER_IN` positive, else negative) so sub-ledger sums reconcile to the account balance exactly.
- Reversed transactions (`is_reversed`) are excluded from sub-ledger sums the same way the account balance handles them.
- Verify with a typecheck and a Playwright pass on the BAMS journal + credit account dialog.
