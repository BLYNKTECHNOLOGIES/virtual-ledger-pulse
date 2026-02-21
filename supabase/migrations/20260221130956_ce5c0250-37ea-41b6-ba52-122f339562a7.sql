
CREATE OR REPLACE FUNCTION set_wallet_transaction_balances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  current_asset_bal NUMERIC;
BEGIN
  -- Get the asset-specific balance from wallet_asset_balances
  SELECT balance INTO current_asset_bal
  FROM public.wallet_asset_balances
  WHERE wallet_id = NEW.wallet_id AND asset_code = NEW.asset_code
  FOR UPDATE;

  IF current_asset_bal IS NULL THEN
    current_asset_bal := 0;
  END IF;

  NEW.balance_before := current_asset_bal;

  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_asset_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
    -- Prevent negative balances for regular debits (allow reversals and ERP conversions which handle their own validation)
    IF NEW.reference_type NOT IN ('ORDER_DELETION', 'REVERSAL', 'RECONCILIATION', 'EXPENSE_REVERSAL', 'ERP_CONVERSION') 
       AND current_asset_bal < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient % balance in wallet. Available: %, Required: %', 
        NEW.asset_code, ROUND(current_asset_bal, 4), ROUND(NEW.amount, 4);
    END IF;
    NEW.balance_after := current_asset_bal - NEW.amount;
  ELSE
    NEW.balance_after := current_asset_bal;
  END IF;

  RETURN NEW;
END;
$$;
