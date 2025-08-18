-- Remove duplicate triggers on bank_transactions table
-- Keep only one trigger for each function

-- Remove duplicate balance update triggers (keep trigger_update_bank_account_balance)
DROP TRIGGER IF EXISTS trg_bank_transactions_balance ON bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_transactions_balance_update ON bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_transactions_update_balance ON bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_tx_update_balance ON bank_transactions;
DROP TRIGGER IF EXISTS trg_update_bank_account_balance ON bank_transactions;
DROP TRIGGER IF EXISTS trg_update_bank_balance_after_bank_tx ON bank_transactions;

-- Remove duplicate lock triggers (keep trigger_lock_balance_after_transaction)
DROP TRIGGER IF EXISTS trg_bank_transactions_lock ON bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_tx_lock_balance ON bank_transactions;
DROP TRIGGER IF EXISTS trg_lock_balance_after_bank_tx ON bank_transactions;
DROP TRIGGER IF EXISTS trg_lock_balance_after_transaction ON bank_transactions;
DROP TRIGGER IF EXISTS trg_lock_balance_after_tx ON bank_transactions;

-- Ensure we have the correct triggers (recreate if needed)
CREATE OR REPLACE TRIGGER trigger_update_bank_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_bank_account_balance();

CREATE OR REPLACE TRIGGER trigger_check_bank_balance
    BEFORE INSERT OR UPDATE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION check_bank_balance_before_transaction();

CREATE OR REPLACE TRIGGER trigger_lock_balance_after_transaction
    AFTER INSERT ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION lock_bank_account_balance_after_transaction();