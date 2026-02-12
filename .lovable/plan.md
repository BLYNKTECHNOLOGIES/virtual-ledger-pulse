
# Inter-Product Conversion Module

## Overview
A new ERP-only (no Binance API) module under Stock Management for recording internal asset conversions (e.g., spending USDT to acquire BNB, or selling BNB back to USDT). Includes a maker-checker approval workflow, fee handling, and full audit trail.

---

## 1. Database Migration

### New table: `erp_product_conversions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Default gen_random_uuid() |
| reference_no | TEXT | Auto-generated (e.g., CONV-20260212-001) |
| wallet_id | UUID FK -> wallets | Target wallet |
| side | TEXT | 'BUY' or 'SELL' |
| asset_code | TEXT | The non-USDT asset (e.g., BNB, ETH) |
| quantity | NUMERIC | Asset quantity |
| price_usd | NUMERIC | USD rate per unit |
| gross_usd_value | NUMERIC | quantity x price_usd |
| fee_percentage | NUMERIC | Fee % (nullable) |
| fee_amount | NUMERIC | Calculated fee value |
| fee_asset | TEXT | BUY = asset_code, SELL = 'USDT' |
| net_asset_change | NUMERIC | For BUY: qty - fee; For SELL: qty (full debit) |
| net_usdt_change | NUMERIC | For BUY: gross_usd (full debit); For SELL: gross - fee |
| status | TEXT | PENDING_APPROVAL / APPROVED / REJECTED |
| created_by | UUID | Creator |
| created_at | TIMESTAMPTZ | |
| approved_by | UUID | Nullable |
| approved_at | TIMESTAMPTZ | Nullable |
| rejected_by | UUID | Nullable |
| rejected_at | TIMESTAMPTZ | Nullable |
| rejection_reason | TEXT | Nullable |
| metadata | JSONB | Extensibility |

### New permissions
- `stock_conversion_create` - can create conversion drafts
- `stock_conversion_approve` - can approve/reject

### RPC: `approve_product_conversion(p_conversion_id, p_approved_by)`
- SECURITY DEFINER, atomic function
- Uses `reversal_guards` pattern for idempotent approval
- Validates sufficient balance (USDT for BUY, asset for SELL)
- Inserts wallet_transactions entries (2-3 per conversion: main debit, main credit, fee debit)
- Updates status to APPROVED
- Logs to system_action_logs

### RPC: `reject_product_conversion(p_conversion_id, p_rejected_by, p_reason)`
- Updates status to REJECTED, sets rejected_by/at/reason
- No balance changes

### Auto-generated reference_no
- Database trigger on INSERT to generate sequential reference like `CONV-YYYYMMDD-NNN`

---

## 2. UI Components

### New tab in Stock Management: "Conversions"
Added as 6th tab with `ArrowLeftRight` icon.

### Sub-tabs within Conversions:

**A. Create Conversion**
- Form fields: Wallet selector, Side (BUY/SELL), Asset (dropdown from product codes excluding USDT), Quantity, USD Price (manual input), Fee % (optional)
- Live calculation panel showing: Gross USD Value, Fee Amount, Fee Asset, Net Asset Change, Net USDT Change
- Submit creates record with status PENDING_APPROVAL

**B. Pending Approval**
- Table of PENDING_APPROVAL records with Approve/Reject action buttons
- Reject opens a reason dialog
- Only visible to users with `stock_conversion_approve` permission

**C. Conversion History**
- Filterable table (date range, wallet, side, asset, status)
- All fields from the spec displayed
- Status badges (Pending = amber, Approved = green, Rejected = red)

### Files to create:
- `src/components/stock/InterProductConversionTab.tsx` - Main tab container with sub-tabs
- `src/components/stock/conversion/CreateConversionForm.tsx` - Form with live calc
- `src/components/stock/conversion/PendingConversionsTable.tsx` - Approval queue
- `src/components/stock/conversion/ConversionHistoryTable.tsx` - Full history
- `src/components/stock/conversion/ConversionApprovalDialog.tsx` - Approve/Reject actions

---

## 3. Hooks / Services

- `src/hooks/useProductConversions.ts`
  - `useCreateConversion()` - mutation to insert draft
  - `usePendingConversions()` - query for pending records
  - `useApproveConversion()` - calls approve RPC
  - `useRejectConversion()` - calls reject RPC
  - `useConversionHistory(filters)` - filtered history query

---

## 4. Posting Logic (on Approve)

**BUY (e.g., buy BNB with USDT):**
1. DEBIT wallet USDT by `gross_usd_value` (reference_type: `ERP_CONVERSION`)
2. CREDIT wallet asset by `quantity` (gross)
3. If fee > 0: DEBIT wallet asset by `fee_amount`

**SELL (e.g., sell BNB for USDT):**
1. DEBIT wallet asset by `quantity`
2. CREDIT wallet USDT by `gross_usd_value`
3. If fee > 0: DEBIT wallet USDT by `fee_amount`

All transactions use the same `reference_id` (conversion ID) and `reference_type = 'ERP_CONVERSION'` for traceability.

---

## 5. Validation Rules

- BUY: Check wallet USDT balance >= gross_usd_value (at approval time, inside RPC with row lock)
- SELL: Check wallet asset balance >= quantity (via wallet_asset_balances, inside RPC)
- Prevent approving already-approved/rejected conversions
- Idempotent approval via reversal_guards table

---

## 6. Audit Trail

- Uses existing `logActionWithCurrentUser` with new action types:
  - `stock.conversion_created`
  - `stock.conversion_approved`
  - `stock.conversion_rejected`

---

## 7. Integration Points

- StockManagement.tsx: Add 6th tab "Conversions"
- StockTransactionsTab: Include `ERP_CONVERSION` in wallet_transactions reference_type filter so conversions appear in the ledger view
- system-action-logger.ts: Add new ActionTypes
- Invalidate relevant query keys on mutations (wallets, wallet_transactions, wallet_asset_balances)

---

## 8. Permissions

- Add `stock_conversion_create` and `stock_conversion_approve` to `app_permission` enum via migration
- UI guards using existing `PermissionGate` component
- Maker-checker: creator cannot approve their own conversion (enforced in RPC)

---

## Summary of Deliverables

| Item | Count |
|------|-------|
| DB Migration (table + RPCs + permissions) | 1 |
| New UI components | 5 |
| New hooks file | 1 |
| Modified existing files | 3 |
