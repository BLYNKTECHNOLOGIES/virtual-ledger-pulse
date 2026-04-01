

## Issue Found: Wallet Ledger Mismatch

The purchase order was corrected to ETH, but the **wallet transaction** still shows as a **USDT credit**:

| Field | Current (Wrong) | Should Be |
|---|---|---|
| Transaction ID | `bd74ad5c-e974-4959-a17e-de545e43666a` |  |
| asset_code | **USDT** | **ETH** |
| amount | 0.2552 | 0.2552 (correct) |
| wallet | BINANCE BLYNK | BINANCE BLYNK (correct) |

**Impact:** USDT balance is overstated by 0.2552, and ETH balance is understated by 0.2552 in the ledger.

## Fix Plan

### Step 1: Migration to correct wallet transaction
Update the `wallet_transactions` record to change `asset_code` from `USDT` to `ETH`:

```sql
UPDATE wallet_transactions 
SET asset_code = 'ETH'
WHERE id = 'bd74ad5c-e974-4959-a17e-de545e43666a';
```

### Step 2: Recalculate wallet_asset_balances
The `update_wallet_balance` trigger should fire automatically on the UPDATE. If not, force a recalculation:

```sql
-- Recalculate USDT balance (remove the 0.2552 that shouldn't be there)
UPDATE wallet_asset_balances 
SET balance = (SELECT COALESCE(SUM(CASE WHEN transaction_type='CREDIT' THEN amount ELSE -amount END), 0) 
               FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT'),
    total_received = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT' AND transaction_type = 'CREDIT'),
    total_sent = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT' AND transaction_type = 'DEBIT')
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- Recalculate ETH balance (add the 0.2552 that should be there)
UPDATE wallet_asset_balances 
SET balance = (SELECT COALESCE(SUM(CASE WHEN transaction_type='CREDIT' THEN amount ELSE -amount END), 0) 
               FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH'),
    total_received = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH' AND transaction_type = 'CREDIT'),
    total_sent = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH' AND transaction_type = 'DEBIT')
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH';
```

This ensures both USDT and ETH balances are accurate after the correction.

