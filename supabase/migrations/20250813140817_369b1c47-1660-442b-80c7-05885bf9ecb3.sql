-- Remove the triggers that might be causing double deduction
-- Let's check what triggers exist first and then disable the problematic ones

-- Drop the purchase order triggers that create bank transactions automatically
DROP TRIGGER IF EXISTS handle_purchase_order_completion_trigger ON purchase_orders;
DROP TRIGGER IF EXISTS handle_purchase_order_insert_trigger ON purchase_orders;
DROP TRIGGER IF EXISTS sync_bank_tx_for_purchase_order_trigger ON purchase_orders;

-- These functions are causing automatic bank transaction creation for purchase orders
-- which conflicts with our manual purchase function
DROP FUNCTION IF EXISTS handle_purchase_order_completion();
DROP FUNCTION IF EXISTS handle_purchase_order_insert();
DROP FUNCTION IF EXISTS sync_bank_tx_for_purchase_order();

-- Keep only the bank_transactions trigger that updates account balances
-- The update_bank_account_balance trigger should remain active