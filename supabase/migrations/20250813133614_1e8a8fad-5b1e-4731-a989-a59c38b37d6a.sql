-- Create debug logging infrastructure to trace purchase order creation issues

-- 1. Create debug log table
CREATE TABLE IF NOT EXISTS debug_po_log (
  id SERIAL PRIMARY KEY,
  payload TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  operation TEXT DEFAULT 'INSERT'
);

-- 2. Create logging function to capture insert attempts
CREATE OR REPLACE FUNCTION log_po_attempt()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the attempt with all data being inserted
  INSERT INTO debug_po_log (payload, operation, created_at)
  VALUES (
    row_to_json(NEW)::text, 
    TG_OP, 
    NOW()
  );
  
  -- Log additional context
  RAISE NOTICE 'PO Insert Attempt: Order=%, Supplier=%, Amount=%, Bank=%', 
    NEW.order_number, NEW.supplier_name, NEW.total_amount, NEW.bank_account_id;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger to capture ALL insert attempts
DROP TRIGGER IF EXISTS debug_po_attempt ON purchase_orders;
CREATE TRIGGER debug_po_attempt
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION log_po_attempt();

-- 4. Enable detailed logging for debugging
SET client_min_messages = DEBUG1;

-- 5. Clear any existing debug logs for a fresh start
TRUNCATE debug_po_log;