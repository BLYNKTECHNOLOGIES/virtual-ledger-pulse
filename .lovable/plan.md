
# Wallet Fee Deduction System Implementation Plan

## Overview
Add a percentage fee field to wallets that will automatically deduct fees from sales and purchase order amounts. The deducted fees will be tracked separately and displayed in the Financial Management section. An "Off Market" option will bypass fee deduction for specific orders.

## Components to Modify

### 1. Database Schema Changes
Add new columns to the `wallets` table:
- `fee_percentage` (DECIMAL, default 0) - The fee percentage to deduct (e.g., 1.5 for 1.5%)
- `is_fee_enabled` (BOOLEAN, default true) - Whether fees are active for this wallet

Create a new table `wallet_fee_deductions` to track all fee deductions:
- `id` (UUID, primary key)
- `wallet_id` (UUID, foreign key to wallets)
- `order_id` (UUID) - Reference to sales/purchase order
- `order_type` (TEXT) - 'SALES' or 'PURCHASE'
- `order_number` (TEXT)
- `gross_amount` (DECIMAL) - Original amount before fee
- `fee_percentage` (DECIMAL) - Fee % applied
- `fee_amount` (DECIMAL) - Calculated fee amount
- `net_amount` (DECIMAL) - Amount after fee deduction
- `created_at` (TIMESTAMP)

### 2. Wallet Management (WalletManagementTab.tsx)
**Add Wallet Dialog Updates:**
- Add "Fee Percentage" input field (0-100, step 0.01)
- Add "Enable Fee Deduction" toggle switch

**Wallet Table Updates:**
- Add "Fee %" column to display configured fee percentage
- Add visual indicator showing if fees are enabled

**Edit Wallet Dialog (New):**
- Create a new edit dialog that allows modifying:
  - Wallet name, address, chain, type
  - Fee percentage
  - Fee enabled toggle

### 3. Sales Order Forms
**StepBySalesFlow.tsx & SalesEntryDialog.tsx Updates:**
- Add "Off Market" checkbox/toggle next to wallet selector
- When "Off Market" is selected:
  - Disable automatic fee calculation
  - Store `is_off_market: true` on the order
- When a wallet is selected (not Off Market):
  - Fetch wallet's fee_percentage
  - Calculate: `fee_amount = total_amount * (fee_percentage / 100)`
  - Display calculated fee and net amount
  - Show breakdown: "Amount: ₹X | Platform Fee (Y%): ₹Z | Net to Bank: ₹W"
- Bank transaction should record `net_amount` (after fee deduction)
- Fee amount recorded separately in `wallet_fee_deductions` table

### 4. Purchase Order Forms
**NewPurchaseOrderDialog.tsx & ManualPurchaseEntryDialog.tsx Updates:**
- Add "Off Market" checkbox/toggle next to wallet selector
- Same fee calculation logic as sales:
  - Fee deducted from total amount
  - Net amount credited to bank (amount - fee)
  - Fee tracked in `wallet_fee_deductions`

### 5. Financial Management (Financials.tsx)
**New "Platform Fees Summary" Section:**
- Add a new tab or card showing:
  - Total fees collected (period-based)
  - Breakdown by wallet
  - Recent fee deductions list with order references
  - Charts showing fee trends

**Fee Summary Cards:**
- Total Platform Fees (Current Period)
- Fees by Sales Orders
- Fees by Purchase Orders
- Average Fee Rate

### 6. WalletSelector Component Updates
- Extend to show fee percentage next to wallet name
- Visual indicator: "Binance (1.5% fee)" or "OKX (No fees)"

## Technical Flow

### Sales Order with Fee:
```
User creates sale for ₹10,000 using "Binance" wallet (1.5% fee)
→ Fee calculated: ₹150
→ Net amount: ₹9,850
→ Bank transaction: CREDIT ₹9,850
→ wallet_fee_deductions: INSERT record with fee_amount=150
→ sales_order: total_amount=10000, fee_amount=150, net_amount=9850
```

### Sales Order Off Market:
```
User creates sale for ₹10,000 with "Off Market" selected
→ No fee applied
→ Bank transaction: CREDIT ₹10,000
→ No wallet_fee_deductions record
→ sales_order: total_amount=10000, is_off_market=true
```

## UI/UX Design

### Off Market Toggle:
```
┌─────────────────────────────────────────────────┐
│ Platform/Wallet *                               │
│ ┌───────────────────────────────────────────┐   │
│ │ Select a wallet...                      ▼ │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│ ☐ Off Market (No platform fees)                 │
└─────────────────────────────────────────────────┘
```

### Fee Display in Form:
```
┌─────────────────────────────────────────────────┐
│ Amount Summary                                  │
│ ─────────────────────────────────────────────── │
│ Gross Amount:        ₹10,000.00                 │
│ Platform Fee (1.5%): -₹150.00                   │
│ ─────────────────────────────────────────────── │
│ Net to Bank:         ₹9,850.00                  │
└─────────────────────────────────────────────────┘
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_wallet_fees.sql` | CREATE | Add fee columns and deductions table |
| `src/integrations/supabase/types.ts` | UPDATE | Add new types (auto-generated) |
| `src/components/stock/WalletManagementTab.tsx` | UPDATE | Add fee fields to create/edit dialogs |
| `src/components/stock/EditWalletDialog.tsx` | CREATE | New dialog for editing wallets |
| `src/components/stock/WalletSelector.tsx` | UPDATE | Show fee % in dropdown |
| `src/components/sales/StepBySalesFlow.tsx` | UPDATE | Add Off Market toggle, fee calculation |
| `src/components/sales/SalesEntryDialog.tsx` | UPDATE | Add Off Market toggle, fee calculation |
| `src/components/purchase/NewPurchaseOrderDialog.tsx` | UPDATE | Add Off Market toggle, fee calculation |
| `src/components/purchase/ManualPurchaseEntryDialog.tsx` | UPDATE | Add Off Market toggle, fee calculation |
| `src/pages/Financials.tsx` | UPDATE | Add Platform Fees Summary section |
| `src/components/financials/PlatformFeesSummary.tsx` | CREATE | New component for fee summary |

## Implementation Order

1. **Database Migration** - Add fee_percentage to wallets, create wallet_fee_deductions table
2. **Wallet Management** - Update create dialog, add edit dialog with fee settings
3. **WalletSelector** - Show fee info in dropdown
4. **Sales Forms** - Add Off Market toggle and fee calculation display
5. **Purchase Forms** - Add Off Market toggle and fee calculation display
6. **Update RPC Functions** - Modify order creation to handle fee deductions
7. **Financials Page** - Add Platform Fees Summary section
8. **Testing** - End-to-end testing of fee flow
