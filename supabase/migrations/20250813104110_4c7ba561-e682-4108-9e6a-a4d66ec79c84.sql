-- Fix: Create proper trigger function for purchase orders to create bank transactions
CREATE OR REPLACE FUNCTION handle_purchase_order_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create bank transaction if status changed to COMPLETED and bank_account_id exists
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' AND NEW.bank_account_id IS NOT NULL THEN
    -- Create bank transaction for the purchase
    INSERT INTO bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      description,
      reference_number,
      transaction_date
    ) VALUES (
      NEW.bank_account_id,
      'EXPENSE',
      NEW.total_amount,
      'Purchase Order - ' || NEW.order_number || ' - ' || NEW.supplier_name,
      NEW.order_number,
      NEW.order_date
    );
    
    -- Update bank account balance
    UPDATE bank_accounts 
    SET balance = balance - NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS purchase_order_completion_trigger ON purchase_orders;
CREATE TRIGGER purchase_order_completion_trigger
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_purchase_order_completion();

-- Also handle for manual entries that are created as COMPLETED
CREATE OR REPLACE FUNCTION handle_purchase_order_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Create bank transaction if order is created as COMPLETED with bank_account_id
  IF NEW.status = 'COMPLETED' AND NEW.bank_account_id IS NOT NULL THEN
    -- Create bank transaction for the purchase
    INSERT INTO bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      description,
      reference_number,
      transaction_date
    ) VALUES (
      NEW.bank_account_id,
      'EXPENSE',
      NEW.total_amount,
      'Purchase Order - ' || NEW.order_number || ' - ' || NEW.supplier_name,
      NEW.order_number,
      NEW.order_date
    );
    
    -- Update bank account balance
    UPDATE bank_accounts 
    SET balance = balance - NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the insert trigger
DROP TRIGGER IF EXISTS purchase_order_insert_trigger ON purchase_orders;
CREATE TRIGGER purchase_order_insert_trigger
  AFTER INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_purchase_order_insert();