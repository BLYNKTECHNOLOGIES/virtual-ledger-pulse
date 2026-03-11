
-- Fix: update_wallet_balance trigger must ALSO update wallet_asset_balances
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  asset TEXT;
BEGIN
  asset := COALESCE(NEW.asset_code, 'USDT');
  
  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    -- Update legacy wallets table (USDT only for backward compat)
    IF asset = 'USDT' THEN
      UPDATE wallets SET current_balance = current_balance + NEW.amount,
        total_received = total_received + NEW.amount, updated_at = now()
      WHERE id = NEW.wallet_id;
    END IF;
    
    -- Update asset-specific balance
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (NEW.wallet_id, asset, NEW.amount, NEW.amount, 0)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
      updated_at = now();
      
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    -- Update legacy wallets table (USDT only for backward compat)
    IF asset = 'USDT' THEN
      UPDATE wallets SET current_balance = current_balance - NEW.amount,
        total_sent = total_sent + NEW.amount, updated_at = now()
      WHERE id = NEW.wallet_id;
    END IF;
    
    -- Update asset-specific balance
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (NEW.wallet_id, asset, -NEW.amount, 0, NEW.amount)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
