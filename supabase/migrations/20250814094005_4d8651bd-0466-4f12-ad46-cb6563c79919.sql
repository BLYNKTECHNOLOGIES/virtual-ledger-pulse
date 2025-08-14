-- Add constraints to prevent negative balances

-- Add check constraint for bank accounts to prevent negative balance
ALTER TABLE bank_accounts 
DROP CONSTRAINT IF EXISTS check_bank_balance_non_negative;

ALTER TABLE bank_accounts 
ADD CONSTRAINT check_bank_balance_non_negative 
CHECK (balance >= 0);

-- Add check constraint for products to prevent negative stock
ALTER TABLE products 
DROP CONSTRAINT IF EXISTS check_product_stock_non_negative;

ALTER TABLE products 
ADD CONSTRAINT check_product_stock_non_negative 
CHECK (current_stock_quantity >= 0);

-- Add check constraint for wallets to prevent negative balance
ALTER TABLE wallets 
DROP CONSTRAINT IF EXISTS check_wallet_balance_non_negative;

ALTER TABLE wallets 
ADD CONSTRAINT check_wallet_balance_non_negative 
CHECK (current_balance >= 0);

-- Create function to check bank balance before transactions
CREATE OR REPLACE FUNCTION check_bank_balance_before_transaction()
RETURNS TRIGGER AS $$
DECLARE
  current_bal NUMERIC;
BEGIN
  -- Get current balance
  SELECT balance INTO current_bal 
  FROM bank_accounts 
  WHERE id = NEW.bank_account_id;
  
  -- Check if transaction would make balance negative
  IF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
    IF current_bal < NEW.amount THEN
      RAISE EXCEPTION 'It cannot be negative check previous entries and balances again!';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bank transactions
DROP TRIGGER IF EXISTS trigger_check_bank_balance ON bank_transactions;
CREATE TRIGGER trigger_check_bank_balance
  BEFORE INSERT ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_bank_balance_before_transaction();

-- Create function to check stock before movements
CREATE OR REPLACE FUNCTION check_stock_before_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_stock NUMERIC;
BEGIN
  -- Get current stock
  SELECT current_stock_quantity INTO current_stock 
  FROM products 
  WHERE id = NEW.product_id;
  
  -- Check if movement would make stock negative
  IF NEW.movement_type IN ('OUT', 'TRANSFER') THEN
    IF current_stock < NEW.quantity THEN
      RAISE EXCEPTION 'It cannot be negative check previous entries and balances again!';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for warehouse stock movements
DROP TRIGGER IF EXISTS trigger_check_stock_movement ON warehouse_stock_movements;
CREATE TRIGGER trigger_check_stock_movement
  BEFORE INSERT ON warehouse_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION check_stock_before_movement();

-- Create function to check wallet balance before transactions
CREATE OR REPLACE FUNCTION check_wallet_balance_before_transaction()
RETURNS TRIGGER AS $$
DECLARE
  current_bal NUMERIC;
BEGIN
  -- Get current balance
  SELECT current_balance INTO current_bal 
  FROM wallets 
  WHERE id = NEW.wallet_id;
  
  -- Check if transaction would make balance negative
  IF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
    IF current_bal < NEW.amount THEN
      RAISE EXCEPTION 'It cannot be negative check previous entries and balances again!';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wallet transactions
DROP TRIGGER IF EXISTS trigger_check_wallet_balance ON wallet_transactions;
CREATE TRIGGER trigger_check_wallet_balance
  BEFORE INSERT ON wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_wallet_balance_before_transaction();