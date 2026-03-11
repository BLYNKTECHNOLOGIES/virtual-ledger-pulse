-- Fix: Add SECURITY DEFINER + SET search_path = public to all critical functions

-- 1. process_sales_order_wallet_deduction (RPC called from frontend)
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(wallet_id uuid, usdt_amount numeric, sales_order_id uuid, p_asset_code text DEFAULT 'USDT'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  current_bal NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
      WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
      ELSE 0 
    END
  ), 0) INTO current_bal
  FROM public.wallet_transactions
  WHERE wallet_transactions.wallet_id = process_sales_order_wallet_deduction.wallet_id
    AND asset_code = p_asset_code;

  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = wallet_id AND is_active = true) THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_bal < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', ROUND(current_bal, 4), ROUND(usdt_amount, 4);
  END IF;
  
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount, reference_type, reference_id,
    description, balance_before, balance_after, asset_code
  ) VALUES (
    wallet_id, 'DEBIT', usdt_amount, 'SALES_ORDER', sales_order_id,
    p_asset_code || ' sold via sales order',
    0, 0, p_asset_code
  ) RETURNING id INTO wallet_transaction_id;
  
  RETURN true;
END;
$function$;

-- 2. create_manual_purchase_secure (RPC called from frontend)
CREATE OR REPLACE FUNCTION public.create_manual_purchase_secure(p_order_number text, p_supplier_name text, p_order_date date, p_total_amount numeric, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_bank_account_id uuid, p_description text DEFAULT ''::text, p_contact_number text DEFAULT NULL::text, p_credit_wallet_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_purchase_order_id UUID;
  v_current_balance NUMERIC;
BEGIN
  SELECT balance INTO v_current_balance 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  IF v_current_balance < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient funds in bank account. Current balance: %, Required: %', v_current_balance, p_total_amount;
  END IF;
  
  INSERT INTO purchase_orders (
    order_number, supplier_name, order_date, description, total_amount,
    contact_number, status, bank_account_id
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount,
    p_contact_number, 'COMPLETED', p_bank_account_id
  ) RETURNING id INTO v_purchase_order_id;
  
  INSERT INTO purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price
  ) VALUES (
    v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount
  );
  
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, reference_number,
    transaction_date, category, related_account_name
  ) VALUES (
    p_bank_account_id, 'EXPENSE', p_total_amount,
    'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
    p_order_number, p_order_date, 'Purchase', p_supplier_name
  );
  
  UPDATE products 
  SET current_stock_quantity = current_stock_quantity + p_quantity,
      total_purchases = total_purchases + p_total_amount,
      updated_at = now()
  WHERE id = p_product_id;
  
  IF p_credit_wallet_id IS NOT NULL THEN
    UPDATE wallets 
    SET current_balance = current_balance + p_quantity,
        total_received = total_received + p_quantity,
        updated_at = now()
    WHERE id = p_credit_wallet_id;
  END IF;
  
  RETURN v_purchase_order_id;
END;
$function$;

-- 3. update_settlement_status_safe (RPC called from frontend)
CREATE OR REPLACE FUNCTION public.update_settlement_status_safe(order_ids uuid[], batch_id text, settled_timestamp timestamp with time zone)
 RETURNS TABLE(updated_id uuid, success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  order_id UUID;
BEGIN
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp,
        updated_at = NOW()
      WHERE id = order_id 
        AND settlement_status = 'PENDING';
      
      IF FOUND THEN
        RETURN QUERY SELECT order_id, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found or already settled'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$function$;

-- 4. Trigger functions - add SECURITY DEFINER + search_path

CREATE OR REPLACE FUNCTION public.check_bank_balance_before_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  current_balance NUMERIC;
  account_name TEXT;
BEGIN
  IF NEW.transaction_type = 'EXPENSE' THEN
    SELECT ba.balance, ba.account_name INTO current_balance, account_name
    FROM bank_accounts ba WHERE ba.id = NEW.bank_account_id;
    
    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'Bank account not found';
    END IF;
    
    IF current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient funds in account "%". Current balance: %, Required: %', 
        account_name, current_balance, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_wallet_balance_before_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  current_balance NUMERIC;
  wallet_name_var TEXT;
BEGIN
  IF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT') THEN
    SELECT w.current_balance, w.wallet_name INTO current_balance, wallet_name_var
    FROM wallets w WHERE w.id = NEW.wallet_id AND w.is_active = true;
    
    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    UPDATE wallets SET current_balance = current_balance + NEW.amount,
      total_received = total_received + NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    UPDATE wallets SET current_balance = current_balance - NEW.amount,
      total_sent = total_sent + NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lock_bank_account_balance_after_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.transaction_type IN ('INCOME', 'DEPOSIT') THEN
    UPDATE bank_accounts SET balance = balance + NEW.amount, updated_at = now()
    WHERE id = NEW.bank_account_id;
  ELSIF NEW.transaction_type IN ('EXPENSE', 'WITHDRAWAL') THEN
    UPDATE bank_accounts SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.bank_account_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_balance_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_sales_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  product_stock NUMERIC;
  product_name TEXT;
  wallet_balance NUMERIC;
  wallet_name TEXT;
  effective_stock NUMERIC;
  effective_wallet NUMERIC;
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    SELECT current_stock_quantity, name INTO product_stock, product_name
    FROM public.products WHERE id = NEW.product_id;
    IF product_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found for ID: %', NEW.product_id;
    END IF;
    effective_stock := product_stock;
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'COMPLETED' AND OLD.product_id = NEW.product_id THEN
      effective_stock := effective_stock + OLD.quantity;
    END IF;
    IF effective_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Available: %, Required: %', 
        product_name, effective_stock, NEW.quantity;
    END IF;
  END IF;
  IF NEW.wallet_id IS NOT NULL AND NEW.usdt_amount IS NOT NULL AND NEW.usdt_amount > 0 THEN
    SELECT current_balance, w.wallet_name INTO wallet_balance, wallet_name
    FROM public.wallets w WHERE w.id = NEW.wallet_id AND w.is_active = true;
    IF wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive for ID: %', NEW.wallet_id;
    END IF;
    effective_wallet := wallet_balance;
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'COMPLETED' AND OLD.wallet_id = NEW.wallet_id 
       AND OLD.usdt_amount IS NOT NULL THEN
      effective_wallet := effective_wallet + OLD.usdt_amount;
    END IF;
    IF effective_wallet < NEW.usdt_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance for "%". Available: %, Required: %', 
        wallet_name, effective_wallet, NEW.usdt_amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_conversion_reference_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_date_str TEXT;
  v_seq INT;
BEGIN
  v_date_str := to_char(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(reference_no FROM '-(\d+)$') AS INT)
  ), 0) + 1
  INTO v_seq
  FROM public.erp_product_conversions
  WHERE reference_no LIKE 'CONV-' || v_date_str || '-%'
    AND id != NEW.id;
  NEW.reference_no := 'CONV-' || v_date_str || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_po_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO debug_po_log (operation, payload)
  VALUES (TG_OP, row_to_json(NEW)::TEXT);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_settlement_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.settlement_status IS NULL THEN
    NEW.settlement_status := 'PENDING';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_compoff_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.comp_off_date + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$function$;