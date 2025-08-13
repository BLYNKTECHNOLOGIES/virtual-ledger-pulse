-- Remove all purchase order triggers that create bank transactions to fix double deduction
-- Use CASCADE to properly remove dependencies

DROP FUNCTION IF EXISTS handle_purchase_order_completion() CASCADE;
DROP FUNCTION IF EXISTS handle_purchase_order_insert() CASCADE;
DROP FUNCTION IF EXISTS sync_bank_tx_for_purchase_order() CASCADE;

-- The update_bank_account_balance() trigger on bank_transactions should remain
-- This ensures balance updates happen only once when bank transactions are created