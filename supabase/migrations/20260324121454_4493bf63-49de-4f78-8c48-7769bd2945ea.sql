CREATE OR REPLACE FUNCTION check_wallet_balance_before_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_current_balance NUMERIC;
  v_asset TEXT;
  wallet_name_var TEXT;
BEGIN
  IF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    
    IF NEW.reference_type IN ('ORDER_DELETION', 'REVERSAL', 'OPENING_BALANCE_ADJUSTMENT') THEN
      RETURN NEW;
    END IF;

    v_asset := COALESCE(NEW.asset_code, 'USDT');

    SELECT w.wallet_name INTO wallet_name_var
    FROM wallets w WHERE w.id = NEW.wallet_id AND w.is_active = true;
    
    IF wallet_name_var IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive';
    END IF;

    SELECT COALESCE(b.balance, 0) INTO v_current_balance
    FROM wallet_asset_balances b
    WHERE b.wallet_id = NEW.wallet_id AND b.asset_code = v_asset;

    IF v_current_balance IS NULL THEN
      v_current_balance := 0;
    END IF;

    IF v_current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient % balance in wallet "%" (available: %, requested: %)',
        v_asset, wallet_name_var, v_current_balance, NEW.amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;