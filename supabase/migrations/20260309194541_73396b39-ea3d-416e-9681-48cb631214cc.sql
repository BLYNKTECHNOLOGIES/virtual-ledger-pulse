-- ============================================================
-- FIX 1: Replace set_wallet_transaction_balances trigger
-- Uses SUM-based balance calculation instead of reading from
-- wallet_asset_balances (which drifts over time)
-- Also adds HARD negative balance prevention
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_wallet_transaction_balances()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_asset_bal NUMERIC;
BEGIN
  -- CRITICAL FIX: Use SUM of existing transactions as source of truth
  -- instead of reading from wallet_asset_balances which drifts
  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
      WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
      ELSE 0 
    END
  ), 0) INTO current_asset_bal
  FROM public.wallet_transactions
  WHERE wallet_id = NEW.wallet_id AND asset_code = NEW.asset_code;

  NEW.balance_before := current_asset_bal;

  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_asset_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    -- Prevent negative balances for regular debits
    -- Only allow ORDER_DELETION and REVERSAL to go negative (user policy)
    IF NEW.reference_type NOT IN ('ORDER_DELETION', 'REVERSAL') 
       AND current_asset_bal < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient % balance in wallet. Available: %, Required: %. Reference: %', 
        NEW.asset_code, ROUND(current_asset_bal, 4), ROUND(NEW.amount, 4), NEW.reference_type;
    END IF;
    NEW.balance_after := current_asset_bal - NEW.amount;
  ELSE
    NEW.balance_after := current_asset_bal;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- FIX 2: Replace update_wallet_balance trigger
-- Handles FEE type consistently across both tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (
      NEW.wallet_id, 
      NEW.asset_code,
      CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE -NEW.amount END,
      CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE 0 END,
      CASE WHEN NEW.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN NEW.amount ELSE 0 END
    )
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE -NEW.amount END,
      total_received = wallet_asset_balances.total_received + CASE WHEN NEW.transaction_type IN ('CREDIT','TRANSFER_IN') THEN NEW.amount ELSE 0 END,
      total_sent = wallet_asset_balances.total_sent + CASE WHEN NEW.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN NEW.amount ELSE 0 END,
      updated_at = now();

    IF NEW.asset_code = 'USDT' THEN
      IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance + NEW.amount,
            total_received = total_received + NEW.amount,
            updated_at = now()
        WHERE id = NEW.wallet_id;
      ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance - NEW.amount,
            total_sent = total_sent + NEW.amount,
            updated_at = now()
        WHERE id = NEW.wallet_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.wallet_asset_balances SET
      balance = balance - CASE WHEN OLD.transaction_type IN ('CREDIT','TRANSFER_IN') THEN OLD.amount ELSE -OLD.amount END,
      total_received = total_received - CASE WHEN OLD.transaction_type IN ('CREDIT','TRANSFER_IN') THEN OLD.amount ELSE 0 END,
      total_sent = total_sent - CASE WHEN OLD.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN OLD.amount ELSE 0 END,
      updated_at = now()
    WHERE wallet_id = OLD.wallet_id AND asset_code = OLD.asset_code;

    IF OLD.asset_code = 'USDT' THEN
      IF OLD.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance - OLD.amount,
            total_received = total_received - OLD.amount,
            updated_at = now()
        WHERE id = OLD.wallet_id;
      ELSIF OLD.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
        UPDATE public.wallets 
        SET current_balance = current_balance + OLD.amount,
            total_sent = total_sent - OLD.amount,
            updated_at = now()
        WHERE id = OLD.wallet_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- FIX 3: Fix recalculate_wallet_balance to be asset-aware
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_wallet_balance(wallet_id_param UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  usdt_balance NUMERIC := 0;
  usdt_received NUMERIC := 0;
  usdt_sent NUMERIC := 0;
BEGIN
  FOR r IN
    SELECT 
      asset_code,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
                        WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
                        ELSE 0 END), 0) AS calc_balance,
      COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount ELSE 0 END), 0) AS calc_received,
      COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN amount ELSE 0 END), 0) AS calc_sent
    FROM wallet_transactions 
    WHERE wallet_id = wallet_id_param
    GROUP BY asset_code
  LOOP
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (wallet_id_param, r.asset_code, r.calc_balance, r.calc_received, r.calc_sent)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = r.calc_balance,
      total_received = r.calc_received,
      total_sent = r.calc_sent,
      updated_at = now();

    IF r.asset_code = 'USDT' THEN
      usdt_balance := r.calc_balance;
      usdt_received := r.calc_received;
      usdt_sent := r.calc_sent;
    END IF;
  END LOOP;
  
  UPDATE wallets 
  SET current_balance = usdt_balance,
      total_received = usdt_received,
      total_sent = usdt_sent,
      updated_at = now()
  WHERE id = wallet_id_param;
END;
$$;

-- ============================================================
-- FIX 4: Fix process_sales_order_wallet_deduction to use SUM
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  wallet_id UUID,
  usdt_amount NUMERIC,
  sales_order_id UUID,
  p_asset_code TEXT DEFAULT 'USDT'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
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
$$;

-- ============================================================
-- FIX 5: Fix approve_product_conversion SELL side SUM
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id UUID, p_approved_by UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_conv RECORD;
  v_pos RECORD;
  v_qty_net NUMERIC(20,9);
  v_gross_usdt NUMERIC(20,9);
  v_exec_rate NUMERIC(20,9);
  v_cost_out NUMERIC(20,9);
  v_realized_pnl NUMERIC(20,9);
  v_new_qty NUMERIC(20,9);
  v_new_pool NUMERIC(20,9);
  v_new_avg NUMERIC(20,9);
  v_fee_usdt_equiv NUMERIC(20,9);
  v_actual_balance NUMERIC(20,9);
  v_original_qty NUMERIC(20,9);
  v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false;
  v_dust_amount NUMERIC(20,9) := 0;
  v_remaining_balance NUMERIC(20,9);
  v_dust_threshold NUMERIC(20,9);
BEGIN
  SELECT * INTO v_conv FROM erp_product_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.'); END IF;
  IF v_conv.status <> 'PENDING_APPROVAL' THEN RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status); END IF;

  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  v_exec_rate := COALESCE(v_conv.execution_rate_usdt, v_conv.price_usd);
  v_gross_usdt := v_conv.gross_usd_value;

  IF v_conv.side = 'BUY' THEN
    IF v_conv.fee_asset = v_conv.asset_code AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      v_qty_net := v_conv.quantity - v_conv.fee_amount;
    ELSE v_qty_net := v_conv.quantity; END IF;
  ELSE v_qty_net := v_conv.quantity; END IF;

  v_original_qty := v_qty_net;
  v_dust_threshold := CASE 
    WHEN v_conv.asset_code IN ('BTC') THEN 0.0001
    WHEN v_conv.asset_code IN ('ETH', 'BNB') THEN 0.001
    WHEN v_conv.asset_code IN ('SHIB', 'PEPE', 'DOGE') THEN 1000
    ELSE 0.01 END;

  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (v_conv.wallet_id, v_conv.asset_code, 0, 0, 0) ON CONFLICT (wallet_id, asset_code) DO NOTHING;

  SELECT * INTO v_pos FROM wallet_asset_positions
  WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code FOR UPDATE;

  IF v_conv.side = 'BUY' THEN
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes) VALUES
      (p_conversion_id, 'USDT_OUT', 'USDT', 0, -v_gross_usdt, 'USDT spent for BUY'),
      (p_conversion_id, 'ASSET_IN', v_conv.asset_code, v_qty_net, 0, 'Asset received (net of fee)');
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, v_conv.asset_code), -v_conv.fee_amount, 0, 'Fee charged on BUY');
    END IF;
    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    -- CRITICAL FIX: Correct SUM handling TRANSFER_IN and FEE properly
    SELECT COALESCE(SUM(
      CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
           WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
           ELSE 0 END
    ), 0) INTO v_actual_balance
    FROM wallet_transactions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF COALESCE(v_actual_balance, 0) < v_qty_net THEN
      IF COALESCE(v_actual_balance, 0) >= v_qty_net * 0.98 AND COALESCE(v_actual_balance, 0) > 0 THEN
        v_qty_net := v_actual_balance; v_adjusted := true;
        v_gross_usdt := ROUND(v_gross_usdt * (v_qty_net / v_original_qty), 9);
      ELSE
        DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Available (ledger): ' || COALESCE(v_actual_balance, 0) || ', Required: ' || v_qty_net);
      END IF;
    ELSIF COALESCE(v_actual_balance, 0) > v_qty_net AND (COALESCE(v_actual_balance, 0) - v_qty_net) <= v_dust_threshold THEN
      v_dust_amount := v_actual_balance - v_qty_net; v_qty_net := v_actual_balance; v_adjusted := true; v_dust_swept := true;
    END IF;

    IF v_actual_balance - v_qty_net < -0.000000001 THEN
      DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 'Safety check failed: negative balance. Available: ' || v_actual_balance || ', Selling: ' || v_qty_net);
    END IF;

    v_cost_out := v_qty_net * v_pos.avg_cost_usdt;
    v_fee_usdt_equiv := CASE WHEN v_conv.fee_asset = 'USDT' THEN COALESCE(v_conv.fee_amount, 0) ELSE COALESCE(v_conv.fee_amount, 0) * v_exec_rate END;
    v_realized_pnl := (v_gross_usdt - v_fee_usdt_equiv) - v_cost_out;

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id, 
      CASE WHEN v_dust_swept THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (incl. dust ' || v_dust_amount || ')'
           WHEN v_adjusted THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (capped from ' || v_original_qty || ')'
           ELSE 'Conversion SELL: sold ' || v_conv.asset_code END, p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN v_pos.cost_pool_usdt - v_cost_out ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes) VALUES
      (p_conversion_id, 'ASSET_OUT', v_conv.asset_code, -v_qty_net, 0, CASE WHEN v_dust_swept THEN 'Asset sold (incl. dust: ' || v_dust_amount || ')' ELSE 'Asset sold' END),
      (p_conversion_id, 'USDT_IN', 'USDT', 0, v_gross_usdt, 'USDT received from SELL'),
      (p_conversion_id, 'COGS', v_conv.asset_code, 0, -v_cost_out, 'Cost of goods sold (WAC)'),
      (p_conversion_id, 'REALIZED_PNL', v_conv.asset_code, 0, v_realized_pnl, 'Realized P&L');
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, 'USDT'), 0, -v_fee_usdt_equiv, 'Fee on SELL');
    END IF;
    IF v_dust_swept THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'DUST_SWEEP', v_conv.asset_code, -v_dust_amount, 0, 'Auto-swept dust remainder (' || v_dust_amount || ' ' || v_conv.asset_code || ')');
    END IF;

    INSERT INTO realized_pnl_events (conversion_id, wallet_id, asset_code, sell_qty, proceeds_usdt_gross, proceeds_usdt_net, cost_out_usdt, realized_pnl_usdt, avg_cost_at_sale)
    VALUES (p_conversion_id, v_conv.wallet_id, v_conv.asset_code, v_qty_net, v_gross_usdt, v_gross_usdt - v_fee_usdt_equiv, v_cost_out, v_realized_pnl, v_pos.avg_cost_usdt);

    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net,
      cost_out_usdt = v_cost_out, realized_pnl_usdt = v_realized_pnl WHERE id = p_conversion_id;
  END IF;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted, 
      'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount, 'original_qty', v_original_qty));

  RETURN jsonb_build_object('success', true, 'auto_capped', v_adjusted, 
    'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'original_qty', v_original_qty, 'adjusted_qty', v_qty_net);
END;
$$;