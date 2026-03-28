-- B40 FIX: Pass asset_code in wallet_transaction inserts within reconcile_sales_order_edit
CREATE OR REPLACE FUNCTION reconcile_sales_order_edit(
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
  p_product_code TEXT DEFAULT 'USDT'
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
  v_asset_code TEXT := COALESCE(p_product_code, 'USDT');
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
        wallet_id, transaction_type, amount, asset_code, reference_type, reference_id,
        description, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'DEBIT', p_new_quantity, v_asset_code, 'SALES_ORDER', p_order_id,
        v_asset_code || ' sold via sales order ' || p_order_number || ' (edited)',
        0, 0
      );

      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, asset_code, reference_type, reference_id,
          description, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, v_asset_code, 'SALES_ORDER_FEE', p_order_id,
          'Platform fee (' || v_asset_code || ') for sales order ' || p_order_number,
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
    SELECT id INTO v_product_id FROM products WHERE code = v_asset_code LIMIT 1;
    
    IF v_product_id IS NOT NULL THEN
      DELETE FROM stock_transactions
      WHERE reference_number = p_order_number
        AND product_id = v_product_id
        AND transaction_type = 'Sales';
      GET DIAGNOSTICS v_deleted_stock = ROW_COUNT;

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