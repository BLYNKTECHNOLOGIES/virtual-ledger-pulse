
-- ============================================================
-- 1. FIX: create_manual_purchase_complete_v2 - add product code lookup and pass asset_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_bank_account_id UUID,
  p_description TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT NULL,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL,
  p_contact_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase_order_id UUID;
  v_bank_balance NUMERIC;
  v_tds_rate NUMERIC := 0;
  v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC;
  v_fee_amount NUMERIC := 0;
  v_net_credit_quantity NUMERIC;
  v_financial_year TEXT;
  v_wallet_balance NUMERIC;
  v_wallet_balance_after_credit NUMERIC;
  v_client_id UUID;
  v_product_code TEXT;
BEGIN
  -- Look up the product code (asset code) from the product
  SELECT code INTO v_product_code
  FROM public.products
  WHERE id = p_product_id;
  
  IF v_product_code IS NULL THEN
    v_product_code := 'USDT'; -- fallback
  END IF;

  -- Determine TDS rate
  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN
      RAISE EXCEPTION 'PAN number is required for 1%% TDS';
    END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  -- Platform fee
  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  -- Validate bank
  SELECT ba.balance INTO v_bank_balance
  FROM public.bank_accounts ba
  WHERE ba.id = p_bank_account_id AND ba.status = 'ACTIVE';

  IF v_bank_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;
  IF v_bank_balance < v_net_payable_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', v_bank_balance, v_net_payable_amount;
  END IF;

  -- Financial year
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN
      EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT
    ELSE
      (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT
  END INTO v_financial_year;

  -- Update client PAN if provided
  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE LOWER(name) = LOWER(p_supplier_name)
       OR (p_contact_number IS NOT NULL AND phone = p_contact_number)
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients
      SET pan_card_number = p_pan_number, updated_at = NOW()
      WHERE id = v_client_id
        AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  -- Create purchase order
  INSERT INTO public.purchase_orders (
    order_number, supplier_name, order_date, description, total_amount,
    contact_number, status, order_status, total_paid, bank_account_id,
    tds_applied, pan_number, tds_amount, net_payable_amount,
    quantity, price_per_unit, is_off_market, fee_percentage, fee_amount,
    net_amount, wallet_id, created_by
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount,
    p_contact_number, 'COMPLETED', 'completed', v_net_payable_amount, p_bank_account_id,
    v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END,
    v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price,
    p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount,
    v_net_credit_quantity, p_credit_wallet_id, p_created_by
  ) RETURNING id INTO v_purchase_order_id;

  -- Order item
  INSERT INTO public.purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id
  ) VALUES (
    v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id
  );

  -- Bank transaction
  INSERT INTO public.bank_transactions (
    bank_account_id, transaction_type, amount, description,
    reference_number, transaction_date, category, related_account_name, created_by
  ) VALUES (
    p_bank_account_id, 'EXPENSE', v_net_payable_amount,
    'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name ||
    CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END,
    p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by
  );

  -- TDS record
  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (
      purchase_order_id, pan_number, total_amount, tds_rate, tds_amount,
      net_payable_amount, deduction_date, financial_year
    ) VALUES (
      v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount,
      v_net_payable_amount, p_order_date, v_financial_year
    );
  END IF;

  -- Wallet credit with correct asset_code
  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, amount, description,
      reference_id, reference_type, asset_code,
      balance_before, balance_after, created_by
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', v_net_credit_quantity,
      'Manual Purchase credit - ' || p_order_number || ' - ' || p_supplier_name ||
      CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || ROUND(v_fee_amount, 4) || ')' ELSE '' END,
      v_purchase_order_id, 'PURCHASE_ORDER', v_product_code,
      0, 0, p_created_by
    );

    -- Fee transaction
    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, transaction_type, amount, description,
        reference_id, reference_type, asset_code,
        balance_before, balance_after, created_by
      ) VALUES (
        p_credit_wallet_id, 'FEE', v_fee_amount,
        'Platform fee for purchase ' || p_order_number,
        v_purchase_order_id, 'PURCHASE_ORDER', v_product_code,
        0, 0, p_created_by
      );
    END IF;
  ELSE
    -- Off-market: stock transaction
    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_cost, total_cost,
      reference_type, reference_id, notes
    ) VALUES (
      p_product_id, 'PURCHASE', p_quantity, p_unit_price, p_total_amount,
      'PURCHASE_ORDER', v_purchase_order_id,
      'Manual purchase ' || p_order_number || ' from ' || p_supplier_name
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_purchase_order_id,
    'message', 'Manual purchase entry completed successfully',
    'tds_amount', v_tds_amount,
    'net_payable_amount', v_net_payable_amount,
    'fee_amount', v_fee_amount,
    'net_credit_quantity', v_net_credit_quantity,
    'asset_code', v_product_code,
    'client_pan_updated', v_client_id IS NOT NULL
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================================
-- 2. FIX: process_sales_order_wallet_deduction - add asset_code support
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  sales_order_id UUID,
  wallet_id UUID,
  usdt_amount NUMERIC,
  p_asset_code TEXT DEFAULT 'USDT'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_asset_balance NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  -- Check asset-specific balance
  IF p_asset_code = 'USDT' THEN
    SELECT current_balance INTO current_asset_balance
    FROM public.wallets 
    WHERE id = wallet_id AND is_active = true;
  ELSE
    SELECT balance INTO current_asset_balance
    FROM public.wallet_asset_balances
    WHERE wallet_asset_balances.wallet_id = process_sales_order_wallet_deduction.wallet_id
      AND asset_code = p_asset_code;
    
    IF current_asset_balance IS NULL THEN
      current_asset_balance := 0;
    END IF;
  END IF;
  
  IF current_asset_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_asset_balance < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient % balance. Available: %, Required: %', p_asset_code, current_asset_balance, usdt_amount;
  END IF;
  
  -- Create wallet debit transaction with correct asset_code
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount,
    reference_type, reference_id, description, asset_code,
    balance_before, balance_after
  ) VALUES (
    wallet_id, 'DEBIT', usdt_amount,
    'SALES_ORDER', sales_order_id,
    p_asset_code || ' sold via sales order', p_asset_code,
    0, 0  -- Trigger sets correct values
  ) RETURNING id INTO wallet_transaction_id;
  
  RETURN true;
END;
$$;

-- ============================================================
-- 3. FIX: reconcile_purchase_order_edit - add asset_code support
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_order_date DATE,
  p_supplier_name TEXT,
  p_old_bank_account_id UUID,
  p_new_bank_account_id UUID,
  p_old_net_payable NUMERIC,
  p_new_net_payable NUMERIC,
  p_old_wallet_id UUID,
  p_new_wallet_id UUID,
  p_old_quantity NUMERIC,
  p_new_quantity NUMERIC,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_fee_percentage NUMERIC DEFAULT 0,
  p_product_code TEXT DEFAULT 'USDT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bank_changed BOOLEAN;
  v_amount_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_deleted_bank INT := 0;
  v_deleted_wallet INT := 0;
  v_old_fee NUMERIC := 0;
  v_new_fee NUMERIC := 0;
  v_new_net_qty NUMERIC;
BEGIN
  v_bank_changed := (p_old_bank_account_id IS DISTINCT FROM p_new_bank_account_id);
  v_amount_changed := (p_old_net_payable IS DISTINCT FROM p_new_net_payable);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);

  -- ============ BANK TRANSACTION RECONCILIATION ============
  IF (v_bank_changed OR v_amount_changed) AND p_new_bank_account_id IS NOT NULL THEN
    DELETE FROM bank_transactions
    WHERE reference_number = p_order_number
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, transaction_date,
      category, description, reference_number, related_account_name
    ) VALUES (
      p_new_bank_account_id, 'EXPENSE', p_new_net_payable,
      COALESCE(p_order_date, CURRENT_DATE), 'Purchase',
      'Stock Purchase - ' || COALESCE(p_supplier_name, '') || ' - Order #' || p_order_number,
      p_order_number, p_supplier_name
    );
  ELSIF v_amount_changed AND p_new_bank_account_id IS NULL AND p_old_bank_account_id IS NOT NULL THEN
    DELETE FROM bank_transactions
    WHERE reference_number = p_order_number
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;
  END IF;

  -- ============ WALLET TRANSACTION RECONCILIATION ============
  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    DELETE FROM wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('PURCHASE_ORDER', 'PURCHASE_ORDER_FEE');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    DELETE FROM wallet_fee_deductions
    WHERE order_id = p_order_id AND order_type = 'PURCHASE_ORDER';

    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
      v_new_net_qty := p_new_quantity - v_new_fee;
    ELSE
      v_new_fee := 0;
      v_new_net_qty := p_new_quantity;
    END IF;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, asset_code, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'CREDIT', v_new_net_qty, 'PURCHASE_ORDER', p_order_id,
        p_product_code || ' purchased via buy order ' || p_order_number ||
          CASE WHEN v_new_fee > 0 THEN ' (after platform fee)' ELSE '' END,
        p_product_code, 0, 0
      );

      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, reference_type, reference_id,
          description, asset_code, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, 'PURCHASE_ORDER_FEE', p_order_id,
          'Platform fee for buy order ' || p_order_number,
          p_product_code, 0, 0
        );

        INSERT INTO wallet_fee_deductions (
          wallet_id, order_id, order_type, order_number, fee_amount
        ) VALUES (
          p_new_wallet_id, p_order_id, 'PURCHASE_ORDER', p_order_number, v_new_fee
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
    'new_fee', v_new_fee,
    'asset_code', p_product_code
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 4. FIX: reconcile_sales_order_edit - add asset_code support
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_sales_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_order_date DATE,
  p_client_name TEXT,
  p_payment_method_id UUID,
  p_old_total_amount NUMERIC,
  p_new_total_amount NUMERIC,
  p_old_wallet_id UUID,
  p_new_wallet_id UUID,
  p_old_quantity NUMERIC,
  p_new_quantity NUMERIC,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_fee_percentage NUMERIC DEFAULT 0,
  p_product_code TEXT DEFAULT 'USDT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_bank_id UUID;
  v_is_gateway BOOLEAN;
  v_deleted_bank INT := 0;
  v_deleted_wallet INT := 0;
  v_old_fee NUMERIC := 0;
  v_new_fee NUMERIC := 0;
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
        COALESCE(p_order_date, CURRENT_DATE), 'Sales',
        'Sales Order (Updated) - ' || p_order_number || ' - ' || COALESCE(p_client_name, ''),
        p_order_number, p_client_name
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
    WHERE order_id = p_order_id AND order_type = 'SALES_ORDER';

    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
    END IF;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, asset_code, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'DEBIT', p_new_quantity, 'SALES_ORDER', p_order_id,
        p_product_code || ' sold via sales order ' || p_order_number || ' (edited)',
        p_product_code, 0, 0
      );

      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, reference_type, reference_id,
          description, asset_code, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, 'SALES_ORDER_FEE', p_order_id,
          'Platform fee for sales order ' || p_order_number,
          p_product_code, 0, 0
        );

        INSERT INTO wallet_fee_deductions (
          wallet_id, order_id, order_type, order_number, fee_amount
        ) VALUES (
          p_new_wallet_id, p_order_id, 'SALES_ORDER', p_order_number, v_new_fee
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
    'new_fee', v_new_fee,
    'asset_code', p_product_code
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 5. FIX: Correct the corrupted BTC purchase transaction
-- Delete the wrong USDT-coded transaction and recreate as BTC
-- ============================================================
DELETE FROM public.wallet_transactions 
WHERE id = 'b5be5742-bda8-4914-8a4e-a929ab1bf20e';

INSERT INTO public.wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, reference_id,
  description, asset_code, balance_before, balance_after, created_by
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'CREDIT', 0.0073828,
  'PURCHASE_ORDER', '937f087e-6b2a-4328-a2dd-0166e0682c5b',
  'Manual Purchase credit - 22855255836652736512 - UNAF AHMAD',
  'BTC', 0, 0, NULL
);
