CREATE OR REPLACE FUNCTION public.set_wallet_transaction_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_bal NUMERIC;
  v_exchange_account_id UUID;
BEGIN
  SELECT twl.exchange_account_id
    INTO v_exchange_account_id
  FROM public.terminal_wallet_links twl
  WHERE twl.wallet_id = NEW.wallet_id
    AND twl.status = 'active'
  ORDER BY twl.updated_at DESC NULLS LAST, twl.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_exchange_account_id IS NOT NULL THEN
    NEW.exchange_account_id := v_exchange_account_id;
  END IF;

  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount
      WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount
      ELSE 0
    END
  ), 0) INTO current_bal
  FROM wallet_transactions
  WHERE wallet_id = NEW.wallet_id AND asset_code = COALESCE(NEW.asset_code, 'USDT');
  
  NEW.balance_before := current_bal;
  
  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    NEW.balance_after := current_bal - NEW.amount;
  ELSE
    NEW.balance_after := current_bal;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_asset TEXT;
  v_wallet_id UUID;
  v_amount NUMERIC;
  v_tx_type TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_asset := COALESCE(NEW.asset_code, 'USDT');
  v_wallet_id := NEW.wallet_id;
  v_amount := NEW.amount;
  v_tx_type := NEW.transaction_type;

  IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
    IF v_asset = 'USDT' THEN
      UPDATE wallets
      SET current_balance = current_balance + v_amount,
          total_received = total_received + v_amount,
          updated_at = now()
      WHERE id = v_wallet_id;
    END IF;

    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent, exchange_account_id)
    VALUES (v_wallet_id, v_asset, v_amount, v_amount, 0, NEW.exchange_account_id)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
      exchange_account_id = EXCLUDED.exchange_account_id,
      updated_at = now();

  ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    IF v_asset = 'USDT' THEN
      UPDATE wallets
      SET current_balance = current_balance - v_amount,
          total_sent = total_sent + v_amount,
          updated_at = now()
      WHERE id = v_wallet_id;
    END IF;

    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent, exchange_account_id)
    VALUES (v_wallet_id, v_asset, -v_amount, 0, v_amount, NEW.exchange_account_id)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
      exchange_account_id = EXCLUDED.exchange_account_id,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_asset_position_on_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.asset_code = 'USDT' THEN
    RETURN NEW;
  END IF;

  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt, exchange_account_id)
  VALUES (NEW.wallet_id, NEW.asset_code, NEW.balance, 0, 0, NEW.exchange_account_id)
  ON CONFLICT (wallet_id, asset_code) DO UPDATE
  SET qty_on_hand = NEW.balance,
      exchange_account_id = EXCLUDED.exchange_account_id,
      updated_at = now();

  RETURN NEW;
END;
$function$;