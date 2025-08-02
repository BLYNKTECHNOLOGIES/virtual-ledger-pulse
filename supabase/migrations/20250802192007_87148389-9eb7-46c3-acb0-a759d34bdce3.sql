-- Fix stock synchronization by updating the sync function to handle sales transactions correctly
-- and sync USDT product stock with wallet balances
UPDATE products 
SET current_stock_quantity = (
  SELECT COALESCE(SUM(current_balance), 0)
  FROM wallets 
  WHERE wallet_type = 'USDT' AND is_active = true
)
WHERE code = 'USDT';

-- Create a trigger to automatically sync USDT stock when wallets change
CREATE OR REPLACE FUNCTION sync_usdt_stock_on_wallet_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if this is a USDT wallet
  IF (TG_OP = 'UPDATE' AND NEW.wallet_type = 'USDT') OR 
     (TG_OP = 'INSERT' AND NEW.wallet_type = 'USDT') OR 
     (TG_OP = 'DELETE' AND OLD.wallet_type = 'USDT') THEN
    
    UPDATE products 
    SET current_stock_quantity = (
      SELECT COALESCE(SUM(current_balance), 0)
      FROM wallets 
      WHERE wallet_type = 'USDT' AND is_active = true
    )
    WHERE code = 'USDT';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_usdt_on_wallet_update ON wallets;

-- Create trigger for wallet updates
CREATE TRIGGER sync_usdt_on_wallet_update
  AFTER INSERT OR UPDATE OR DELETE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION sync_usdt_stock_on_wallet_change();