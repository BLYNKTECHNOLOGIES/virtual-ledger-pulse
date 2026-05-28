## Goal

Make every transaction-like row across the ERP clickable to open a read-only detail dialog. The dialog also exposes a "Open in module" deep link that is gated by the user's existing module permissions (view allowed, deep-link disabled if the user lacks access to the target module). No changes to default UI styling, no hover animations, no row-level visual treatment beyond a pointer cursor.

## Approach

### 1. Central detail-view infrastructure (new)

Create one reusable system that any list/table can plug into instead of building one-off dialogs per page.

- `src/components/transaction-detail/TransactionDetailProvider.tsx` — context provider mounted once in `App.tsx`. Exposes `openTransaction({ type, id })`. Holds the single dialog instance so any row anywhere can trigger it.
- `src/components/transaction-detail/TransactionDetailDialog.tsx` — single shared `Dialog` (reuses existing `ui/dialog`). Renders a header (type + reference number + status badge), a read-only field grid, and a footer with `Open in <Module>` button.
- `src/components/transaction-detail/registry.ts` — maps a `TransactionType` to:
  - `fetcher(id)` → react-query loader hitting the right table/view
  - `render(record)` → read-only field layout
  - `deepLink(record)` → route + required permission key
  - `permissionKey` → the same key used today by `usePermissions` to gate the source module

- `src/components/transaction-detail/useTransactionDetail.ts` — thin hook returning `openTransaction`.

Supported `TransactionType`s (one adapter file each under `transaction-detail/adapters/`):

```text
purchase_order, sales_order, expense, income, wallet_transaction,
payment_split (purchase + sales), bank_transaction (BAMS),
spot_trade, product_conversion, p2p_order (terminal),
ad_action_log, payroll_entry, loan, expense_claim, task
```

Each adapter is small (~40 LOC) and self-contained, so rollout per module is a single file add + table wiring.

### 2. Permission gating

- Detail dialog itself is always viewable to any authenticated user (read-only summary of a transaction they could already see in the list they clicked from — no privilege escalation).
- The `Open in <Module>` button calls `usePermissions().can(adapter.permissionKey, 'view')`. If false, the button renders disabled with tooltip "You don't have access to this module" — never navigates. This matches the existing role hierarchy and granular module permissions already enforced elsewhere.

### 3. Row wiring (no visual changes)

Add a tiny `ClickableRow` wrapper in `src/components/transaction-detail/ClickableRow.tsx`:

```tsx
<TableRow onClick={() => open({type, id})} className="cursor-pointer">
```

- No hover background change, no scale, no animation — only `cursor-pointer`.
- Clicks on interactive children (buttons, links, inputs, checkboxes) are stopped via a single `onClickCapture` guard inside the wrapper, so existing row actions keep working.

### 4. Rollout (entire ERP)

Sweep these pages/components and replace `<TableRow>` with `<ClickableRow type=... id=...>` (or add `onClick` where rows are custom divs). No other visual edits.

```text
PnL          src/pages/ProfitLoss.tsx (trades, expense/income)
Purchase     src/pages/Purchase.tsx + list components
Sales        Sales orders list, split payments
Accounting   src/pages/Accounting.tsx ledger rows
BAMS         src/pages/BAMS.tsx bank transactions, beneficiaries-as-tx where applicable
Wallet/Stock src/pages/StockManagement.tsx wallet_transactions table
Spot Trade   spot trade + conversion tables
Terminal     P2P orders list, ad action log, small payments
ERP Entry    src/pages/ErpEntryManager.tsx feed rows
Tasks        src/pages/Tasks.tsx rows (open task detail)
HR           Payroll entries, loans, expense claims, attendance punches
```

For lists that already have an "Open" / row-edit action (e.g. Purchase orders), the row click opens the new read-only detail dialog; the existing edit button is preserved and unchanged.

### 5. Default UI guarantees

- No row hover animation, no transform, no shadow change.
- No new badges, columns, or layout reflow.
- Cursor changes to pointer only on rows that are now clickable — this is the single intentional affordance.
- Dialog uses existing `Dialog` primitives so dark/light theming is automatic.

### 6. Technical details

- All adapter queries use `@tanstack/react-query` keyed by `['tx-detail', type, id]`, `staleTime: 30s`, no polling — matches project memory (no global refetch).
- All currency rendering reuses `formatCurrency` / `format-smart-decimal` helpers already in the project.
- Wallet transaction adapter follows the ledger truth source (`wallet_transactions` + `wallet_asset_balances`) — no recomputation.
- Payment splits adapter reads `purchase_order_payment_splits` / `sales_order_payment_splits` exclusively.
- Deep links use existing routes; nothing new added to the router.

### 7. Out of scope

- No edits from the detail dialog.
- No new database tables, columns, RPCs, or migrations.
- No changes to how transactions are computed, valued, or aggregated.
- No changes to PnL formulas or any business logic.

## Deliverables

1. New folder `src/components/transaction-detail/` with provider, dialog, registry, `ClickableRow`, and one adapter per supported type.
2. `App.tsx` wraps children in `<TransactionDetailProvider>`.
3. Module-by-module sweep wiring rows to `ClickableRow` — visual output unchanged except pointer cursor on clickable rows.
4. Permission-gated `Open in <Module>` deep links in the dialog footer.
