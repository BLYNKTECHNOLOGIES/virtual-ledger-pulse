
-- Fix validate_sales_order_stock to account for existing allocations on UPDATE
CREATE OR REPLACE FUNCTION public.validate_sales_order_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  product_stock NUMERIC;
  product_name TEXT;
  wallet_balance NUMERIC;
  wallet_name TEXT;
  effective_stock NUMERIC;
  effective_wallet NUMERIC;
BEGIN
  -- Validate product stock if product_id is specified
  IF NEW.product_id IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    SELECT current_stock_quantity, name INTO product_stock, product_name
    FROM public.products 
    WHERE id = NEW.product_id;
    
    IF product_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found for ID: %', NEW.product_id;
    END IF;
    
    effective_stock := product_stock;
    
    -- On UPDATE of a completed order, add back the old quantity since it was already deducted
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'COMPLETED' AND OLD.product_id = NEW.product_id THEN
      effective_stock := effective_stock + OLD.quantity;
    END IF;
    
    IF effective_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Available: %, Required: %', 
        product_name, effective_stock, NEW.quantity;
    END IF;
  END IF;
  
  -- Validate wallet balance if wallet_id is specified
  IF NEW.wallet_id IS NOT NULL AND NEW.usdt_amount IS NOT NULL AND NEW.usdt_amount > 0 THEN
    SELECT current_balance, w.wallet_name INTO wallet_balance, wallet_name
    FROM public.wallets w
    WHERE w.id = NEW.wallet_id AND w.is_active = true;
    
    IF wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found or inactive for ID: %', NEW.wallet_id;
    END IF;
    
    effective_wallet := wallet_balance;
    
    -- On UPDATE of a completed order with same wallet, add back the old usdt_amount
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
$$;

-- Update reconcile_sales_order_edit to also handle stock transactions
CREATE OR REPLACE FUNCTION public.reconcile_sales_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_old_total_amount NUMERIC,
  p_new_total_amount NUMERIC,
  p_old_quantity NUMERIC,
  p_new_quantity NUMERIC,
  p_old_wallet_id UUID,
  p_new_wallet_id UUID,
  p_payment_method_id UUID,
  p_client_name TEXT,
  p_order_date TEXT,
  p_is_off_market BOOLEAN,
  p_fee_percentage NUMERIC,
  p_product_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_bank_id UUID;
  v_is_gateway BOOLEAN;
  v_deleted_bank INT := 0;
  v_deleted_wallet INT := 0;
  v_deleted_stock INT := 0;
  v_old_fee NUMERIC := 0;
  v_new_fee NUMERIC := 0;
  v_product_id UUID;
BEGIN
  v_amount_changed := (p_old_total_amount IS DISTINCT FROM p_new_total_amount);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);

  -- ============ BANK TRANSACTION RECONCILIATION ============
  IF v_amount_changed AND p_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_bank_id, v_is_gateway
    FROM sales_payment_methods
    WHERE id = p_payment_method_id;

    IF v_bank_id IS NOT NULL AND NOT COALESCE(v_is_gateway, false) THEN
      DELETE FROM bank_transactions
      WHERE reference_number = p_order_number
        AND transaction_type = 'INCOME';
      GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

      INSERT INTO bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        category, description, reference_number, related_account_name
      ) VALUES (
        v_bank_id, 'INCOME', p_new_total_amount,
        COALESCE(p_order_date::date, CURRENT_DATE),
        'Sales',
        'Sales Order (Updated) - ' || p_order_number || ' - ' || COALESCE(p_client_name, ''),
        p_order_number,
        p_client_name
      );
    END IF;
  END IF;

  -- ============ WALLET TRANSACTION RECONCILIATION ============
  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    DELETE FROM wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    DELETE FROM wallet_fee_deductions
    WHERE order_id = p_order_id
      AND order_type = 'SALES_ORDER';

    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
    END IF;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'DEBIT', p_new_quantity, 'SALES_ORDER', p_order_id,
        'USDT sold via sales order ' || p_order_number || ' (edited)',
        0, 0
      );

      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, reference_type, reference_id,
          description, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, 'SALES_ORDER_FEE', p_order_id,
          'Platform fee for sales order ' || p_order_number,
          0, 0
        );

        INSERT INTO wallet_fee_deductions (
          wallet_id, order_id, order_type, order_number, fee_amount
        ) VALUES (
          p_new_wallet_id, p_order_id, 'SALES_ORDER', p_order_number, v_new_fee
        );
      END IF;
    END IF;
  END IF;

  -- ============ STOCK TRANSACTION RECONCILIATION ============
  IF v_quantity_changed OR v_amount_changed THEN
    -- Get product_id for stock lookup
    SELECT id INTO v_product_id FROM products WHERE code = COALESCE(p_product_code, 'USDT') LIMIT 1;
    
    IF v_product_id IS NOT NULL THEN
      -- Delete old stock transactions for this order
      DELETE FROM stock_transactions
      WHERE reference_number = p_order_number
        AND product_id = v_product_id
        AND transaction_type = 'Sales';
      GET DIAGNOSTICS v_deleted_stock = ROW_COUNT;

      -- Recreate stock transaction with updated values
      IF p_new_quantity > 0 THEN
        INSERT INTO stock_transactions (
          product_id, transaction_type, quantity, unit_price, total_amount,
          transaction_date, supplier_customer_name, reference_number, reason
        ) VALUES (
          v_product_id, 'Sales', -p_new_quantity, 
          CASE WHEN p_new_quantity > 0 THEN p_new_total_amount / p_new_quantity ELSE 0 END,
          p_new_total_amount, COALESCE(p_order_date::date, CURRENT_DATE),
          p_client_name, p_order_number, 'Sales Order Transaction (Updated)'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount_changed', v_amount_changed,
    'quantity_changed', v_quantity_changed,
    'wallet_changed', v_wallet_changed,
    'deleted_bank_txs', v_deleted_bank,
    'deleted_wallet_txs', v_deleted_wallet,
    'deleted_stock_txs', v_deleted_stock,
    'new_fee', v_new_fee
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
