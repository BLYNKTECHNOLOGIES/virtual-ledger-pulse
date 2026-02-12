
-- =============================================
-- PURCHASE ORDER EDIT RECONCILIATION RPC
-- =============================================
-- Handles: bank transaction, wallet transaction, platform fee reversal/recreation
-- when a completed purchase order's financial fields are edited.

CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_old_total_amount NUMERIC,
  p_new_total_amount NUMERIC,
  p_old_net_payable NUMERIC,
  p_new_net_payable NUMERIC,
  p_old_quantity NUMERIC,
  p_new_quantity NUMERIC,
  p_old_wallet_id UUID,
  p_new_wallet_id UUID,
  p_old_bank_account_id UUID,
  p_new_bank_account_id UUID,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_is_off_market BOOLEAN DEFAULT false,
  p_fee_percentage NUMERIC DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- If bank account or amount changed, delete old EXPENSE txs and recreate
  IF (v_bank_changed OR v_amount_changed) AND p_new_bank_account_id IS NOT NULL THEN
    -- Delete ALL existing EXPENSE bank transactions for this order
    DELETE FROM bank_transactions
    WHERE reference_number = p_order_number
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

    -- Create new EXPENSE transaction with updated amount
    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, transaction_date,
      category, description, reference_number, related_account_name
    ) VALUES (
      p_new_bank_account_id, 'EXPENSE', p_new_net_payable,
      COALESCE(p_order_date, CURRENT_DATE),
      'Purchase',
      'Stock Purchase - ' || COALESCE(p_supplier_name, '') || ' - Order #' || p_order_number,
      p_order_number,
      p_supplier_name
    );
  ELSIF v_amount_changed AND p_new_bank_account_id IS NULL AND p_old_bank_account_id IS NOT NULL THEN
    -- Bank removed, just delete old transactions
    DELETE FROM bank_transactions
    WHERE reference_number = p_order_number
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;
  END IF;

  -- Also handle split payment bank transactions if they exist
  IF v_amount_changed OR v_bank_changed THEN
    -- Delete any split payment bank transactions (they reference same order_number)
    -- Split payments will be re-handled by the frontend after this RPC
    NULL; -- Splits are managed separately by the dialog
  END IF;

  -- ============ WALLET TRANSACTION RECONCILIATION ============
  -- If wallet or quantity changed, reverse old wallet txs and create new ones
  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    -- Delete ALL wallet transactions for this order (PURCHASE_ORDER + fee)
    -- The DELETE trigger will automatically reverse the balances
    DELETE FROM wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('PURCHASE_ORDER', 'PURCHASE_ORDER_FEE');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    -- Delete any fee deduction records
    DELETE FROM wallet_fee_deductions
    WHERE order_id = p_order_id
      AND order_type = 'PURCHASE_ORDER';

    -- Delete reversal guards related to fee processing for this order
    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    -- Calculate new fee and net quantity
    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
      v_new_net_qty := p_new_quantity - v_new_fee;
    ELSE
      v_new_fee := 0;
      v_new_net_qty := p_new_quantity;
    END IF;

    -- Create new wallet CREDIT transaction on new wallet (if wallet assigned)
    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'CREDIT', v_new_net_qty, 'PURCHASE_ORDER', p_order_id,
        'USDT purchased via buy order ' || p_order_number ||
          CASE WHEN v_new_fee > 0 THEN ' (after platform fee)' ELSE '' END,
        0, 0  -- Trigger will set correct values
      );

      -- Create fee debit if applicable
      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, reference_type, reference_id,
          description, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, 'PURCHASE_ORDER_FEE', p_order_id,
          'Platform fee for purchase order ' || p_order_number,
          0, 0  -- Trigger will set correct values
        );

        -- Record fee deduction
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
    'bank_changed', v_bank_changed,
    'amount_changed', v_amount_changed,
    'wallet_changed', v_wallet_changed,
    'quantity_changed', v_quantity_changed,
    'deleted_bank_txs', v_deleted_bank,
    'deleted_wallet_txs', v_deleted_wallet,
    'new_fee', v_new_fee,
    'new_net_qty', v_new_net_qty
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_purchase_order_edit(
  UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, UUID, UUID, UUID, TEXT, DATE, BOOLEAN, NUMERIC
) TO authenticated;

-- =============================================
-- SALES ORDER EDIT RECONCILIATION RPC
-- =============================================
-- Handles bank INCOME transaction amount update when total_amount changes
-- Also handles fee recalculation

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
  p_order_date DATE,
  p_is_off_market BOOLEAN DEFAULT false,
  p_fee_percentage NUMERIC DEFAULT 0
)
RETURNS jsonb
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
  v_old_fee NUMERIC := 0;
  v_new_fee NUMERIC := 0;
BEGIN
  v_amount_changed := (p_old_total_amount IS DISTINCT FROM p_new_total_amount);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);

  -- ============ BANK TRANSACTION RECONCILIATION ============
  -- If amount changed, update bank INCOME transaction
  IF v_amount_changed AND p_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_bank_id, v_is_gateway
    FROM sales_payment_methods
    WHERE id = p_payment_method_id;

    -- Only update bank tx for non-gateway methods
    IF v_bank_id IS NOT NULL AND NOT COALESCE(v_is_gateway, false) THEN
      -- Delete old INCOME transactions
      DELETE FROM bank_transactions
      WHERE reference_number = p_order_number
        AND transaction_type = 'INCOME';
      GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

      -- Create new INCOME transaction with updated amount
      INSERT INTO bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        category, description, reference_number, related_account_name
      ) VALUES (
        v_bank_id, 'INCOME', p_new_total_amount,
        COALESCE(p_order_date, CURRENT_DATE),
        'Sales',
        'Sales Order (Updated) - ' || p_order_number || ' - ' || COALESCE(p_client_name, ''),
        p_order_number,
        p_client_name
      );
    END IF;
  END IF;

  -- ============ WALLET TRANSACTION RECONCILIATION ============
  -- If wallet or quantity changed, reverse old and create new
  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    -- Delete ALL wallet transactions for this order
    DELETE FROM wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    -- Delete fee deduction records
    DELETE FROM wallet_fee_deductions
    WHERE order_id = p_order_id
      AND order_type = 'SALES_ORDER';

    -- Delete reversal guards for fees
    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    -- Calculate new fee
    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
    END IF;

    -- Create new DEBIT transaction on new wallet
    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'DEBIT', p_new_quantity, 'SALES_ORDER', p_order_id,
        'USDT sold via sales order ' || p_order_number || ' (edited)',
        0, 0  -- Trigger will set correct values
      );

      -- Create fee debit if applicable
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

  RETURN jsonb_build_object(
    'success', true,
    'amount_changed', v_amount_changed,
    'quantity_changed', v_quantity_changed,
    'wallet_changed', v_wallet_changed,
    'deleted_bank_txs', v_deleted_bank,
    'deleted_wallet_txs', v_deleted_wallet,
    'new_fee', v_new_fee
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_sales_order_edit(
  UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, UUID, UUID, TEXT, DATE, BOOLEAN, NUMERIC
) TO authenticated;
