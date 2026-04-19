
The user wants the "Balance Adjustment Account" excluded from all financial calculations (Total Asset Value, P&L, Total Bank Balance widgets, stats). It should still exist as a bucket but not contribute to any aggregate.

Let me explore how this account is identified and where it's used.
<lov-tool-use id="toolu_vrtx_01Gba8VyUk97aLaLFUvc5YsJ" name="code--exec" integration-id="code" data="{\"command\": \"psql -c \\\"SELECT id, account_name, bank_name, account_type, status, balance FROM bank_accounts WHERE account_name ILIKE '%adjust%' OR bank_name ILIKE '%adjust%' OR account_name ILIKE '%balance adjust%';\\\"\", \"user_facing_description\": \"Looking up the Balance Adjustment account in the database\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01JT7sjSMot5dfdamJdhHVmV" name="code--search_files" integration-id="code" data="{\"query\": \"Balance Adjustment|balance_adjustment|BALANCE ADJUSTMENT\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01SBFi6132DG2hZz9C5nLHiu" name="code--search_files" integration-id="code" data="{\"query\": \"Balance Adjustment|balance_adjustment\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01GjMRyySXcPDk5m6PY2bneK" name="tool_search" data="{\"target\": \"supabase--read_query\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Gemh64w8shrwaiXZzK27ck" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT id, account_name, bank_name, account_type, status, balance FROM bank_accounts WHERE account_name ILIKE '%adjust%' OR bank_name ILIKE '%adjust%';\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01PY5Kyr5iW1GrTcRQXG2vje" name="code--search_files" integration-id="code" data="{\"query\": \"Total Asset Value|total_asset_value|Net Total Asset|TAV\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01BASm3qkQQNFNyNAGaAZCA3" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"*.ts,*.tsx\", \"query\": \"Bank Balances \\\\(Active|bank_accounts.*ACTIVE.*DORMANT|totalBankBalance\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01C8F9Le2dDxkTYujcTDL1iC" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/financials/TotalAssetValueWidget.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01X6tihaJQdazHyAxxwuuS2w" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Financials.tsx\", \"lines\": \"80-130\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Jq2mj6REgW9NwvdhYRp13H" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Dashboard.tsx\", \"lines\": \"260-310\"}">
</lov-tool-use>
I have enough context. Let me also check for "Balance Adjustment Wallet" usage in stock/wallet calculations.
<lov-tool-use id="toolu_vrtx_015pQAqWBArJ4H9Be6mWNL64" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT id, wallet_name, current_balance, is_active FROM wallets WHERE wallet_name ILIKE '%adjust%';\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013qP47di6Sd9L4MGvwd49bE" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"*.ts,*.tsx\", \"query\": \"Balance Adjustment Wallet|ADJUSTMENT_WALLET\"}">
</lov-tool-use>
<lov-plan>
## Issue
The "Balance Adjustment Account" (Bank: Internal, balance ₹48,073) is a contra-entry bucket used purely for audit balancing of manual adjustments. It is currently being summed into:
- `TotalAssetValueWidget` (Bank Balances breakdown + Net TAV)
- `snapshot-asset-value` edge function (daily TAV history)
- `Financials` page (Bank Balance card)
- `Dashboard` page (bankBalance / totalCash widget)
- `PurchaseManagement` totals
- Anywhere else `bank_accounts` is summed

This double-counts a non-real ledger and inflates stats. The same applies to a future "Balance Adjustment Wallet" if created.

## Plan

Introduce a single source-of-truth filter that excludes adjustment-bucket accounts/wallets from all aggregations while keeping them visible in BAMS for audit.

### 1. Add exclusion constants
Create `src/lib/adjustment-accounts.ts` exporting:
- `ADJUSTMENT_BANK_NAMES = ["Balance Adjustment Account"]`
- `ADJUSTMENT_WALLET_NAMES = ["Balance Adjustment Wallet"]`
- Helper `isAdjustmentBank(name)` / `isAdjustmentWallet(name)` (case-insensitive).

### 2. Filter in all aggregation sites
Apply `.not('account_name', 'in', '("Balance Adjustment Account")')` (or post-filter) in:
- `src/components/financials/TotalAssetValueWidget.tsx` (bank query + breakdown list)
- `src/pages/Financials.tsx` (bank balance card query)
- `src/pages/Dashboard.tsx` (bankBalance calculation)
- `src/components/bams/PurchaseManagement.tsx` (`getTotalBankBalance`)
- `supabase/functions/snapshot-asset-value/index.ts` (daily snapshot — bank sum)

For wallets, add the same exclusion in `fetchActiveWalletsWithLedgerUsdtBalance` consumers and the snapshot edge function (in case a Balance Adjustment Wallet exists).

### 3. Keep BAMS visibility intact
Do NOT filter the adjustment account out of:
- BAMS bank account listing / management screens
- Manual adjustment dialog target picker
- Journal/transaction views (the contra entry must remain auditable)

### 4. Optional UI marker
In BAMS list, add a small "Audit Bucket — excluded from totals" badge next to the adjustment account so users understand its role.

### Files to edit
- `src/lib/adjustment-accounts.ts` (new)
- `src/components/financials/TotalAssetValueWidget.tsx`
- `src/pages/Financials.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/bams/PurchaseManagement.tsx`
- `supabase/functions/snapshot-asset-value/index.ts`
- `src/components/bams/BankAccountManagement.tsx` (optional badge)

### Memory
Save a constraint memory: "Balance Adjustment Account / Wallet are audit contra-buckets — must be excluded from all balance/TAV/PnL/dashboard aggregations but remain visible in BAMS."

### Note on historical TAV
The previously stored `asset_value_history` snapshots already include the adjustment balance. New snapshots after the fix will be clean. Backfilling history is out of scope unless you want it — flag if needed.
