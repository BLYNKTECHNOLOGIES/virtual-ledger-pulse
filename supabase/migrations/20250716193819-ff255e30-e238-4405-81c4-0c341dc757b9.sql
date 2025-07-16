-- Add new columns to purchase_payment_methods table for min/max limits and safe fund
ALTER TABLE purchase_payment_methods 
ADD COLUMN min_limit numeric NOT NULL DEFAULT 0,
ADD COLUMN max_limit numeric NOT NULL DEFAULT 0,
ADD COLUMN safe_fund boolean NOT NULL DEFAULT false;

-- Add constraints to prevent negative values
ALTER TABLE purchase_payment_methods 
ADD CONSTRAINT check_payment_limit_positive CHECK (payment_limit >= 0),
ADD CONSTRAINT check_current_usage_positive CHECK (current_usage >= 0),
ADD CONSTRAINT check_min_limit_positive CHECK (min_limit >= 0),
ADD CONSTRAINT check_max_limit_positive CHECK (max_limit >= 0),
ADD CONSTRAINT check_min_max_limit_order CHECK (min_limit <= max_limit);

-- Add constraints to bank_accounts to prevent negative balance
ALTER TABLE bank_accounts 
ADD CONSTRAINT check_bank_balance_positive CHECK (balance >= 0);

-- Add constraints to stock-related tables to prevent negative quantities
ALTER TABLE products 
ADD CONSTRAINT check_product_stock_positive CHECK (current_stock_quantity >= 0);

-- Add constraints to warehouse_stock_movements to prevent negative quantities
ALTER TABLE warehouse_stock_movements 
ADD CONSTRAINT check_warehouse_stock_positive CHECK (quantity >= 0);

-- Add a validation function to check negative values before transactions
CREATE OR REPLACE FUNCTION validate_negative_values()
RETURNS TRIGGER AS $$
BEGIN
  -- Check bank account balance
  IF TG_TABLE_NAME = 'bank_transactions' THEN
    IF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      DECLARE
        current_balance numeric;
      BEGIN
        SELECT balance INTO current_balance FROM bank_accounts WHERE id = NEW.bank_account_id;
        IF current_balance < NEW.amount THEN
          RAISE EXCEPTION 'Bank account balance cannot be negative. Available: ₹%, Required: ₹%', current_balance, NEW.amount;
        END IF;
      END;
    END IF;
  END IF;
  
  -- Check payment method usage
  IF TG_TABLE_NAME = 'purchase_payment_methods' THEN
    IF NEW.current_usage < 0 THEN
      RAISE EXCEPTION 'Payment method usage cannot be negative';
    END IF;
    IF NEW.payment_limit < 0 THEN
      RAISE EXCEPTION 'Payment limit cannot be negative';
    END IF;
  END IF;
  
  -- Check product stock
  IF TG_TABLE_NAME = 'products' THEN
    IF NEW.current_stock_quantity < 0 THEN
      RAISE EXCEPTION 'Stock quantity cannot be negative';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;