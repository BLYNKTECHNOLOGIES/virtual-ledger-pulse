DO $$
DECLARE
  v_sync RECORD;
  v_sales_order_id UUID;
  v_qty NUMERIC;
  v_commission NUMERIC;
  v_net_qty NUMERIC;
  v_total NUMERIC;
  v_unit_price NUMERIC;
  v_order_date DATE;
  v_wallet_id UUID;
  v_user_id UUID;
  v_user_text TEXT;
  v_asset TEXT;
  v_order_number TEXT;
BEGIN
  SELECT * INTO v_sync
  FROM public.terminal_sales_sync
  WHERE id = '67af65fe-3c98-4334-80cd-4f491dca445d';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'terminal_sales_sync record not found';
  END IF;

  SELECT id INTO v_sales_order_id
  FROM public.sales_orders
  WHERE terminal_sync_id = '67af65fe-3c98-4334-80cd-4f491dca445d'
  LIMIT 1;

  v_qty := COALESCE((v_sync.order_data->>'amount')::NUMERIC, 0);
  v_commission := COALESCE((v_sync.order_data->>'commission')::NUMERIC, 0);
  v_net_qty := GREATEST(v_qty - v_commission, 0);
  v_total := COALESCE((v_sync.order_data->>'total_price')::NUMERIC, 0);
  v_unit_price := COALESCE((v_sync.order_data->>'unit_price')::NUMERIC, 0);
  v_wallet_id := NULLIF(v_sync.order_data->>'wallet_id', '')::UUID;
  v_user_id := NULLIF(v_sync.reviewed_by, '')::UUID;
  v_user_text := COALESCE(v_sync.reviewed_by, v_user_id::text);
  v_asset := UPPER(COALESCE(v_sync.order_data->>'asset', 'USDT'));
  v_order_date := (
    (to_timestamp(COALESCE((v_sync.order_data->>'create_time')::NUMERIC, extract(epoch from now()) * 1000) / 1000)
      AT TIME ZONE 'Asia/Kolkata')::DATE
  );

  IF v_sales_order_id IS NULL THEN
    v_order_number := 'SO-TRM-' || RIGHT(v_sync.binance_order_number, 8) || '-R1';

    INSERT INTO public.sales_orders (
      order_number,
      client_name,
      client_phone,
      client_state,
      order_date,
      total_amount,
      quantity,
      price_per_unit,
      product_id,
      wallet_id,
      platform,
      fee_percentage,
      fee_amount,
      net_amount,
      sales_payment_method_id,
      payment_status,
      status,
      settlement_status,
      is_off_market,
      description,
      created_by,
      source,
      terminal_sync_id,
      client_id
    ) VALUES (
      v_order_number,
      COALESCE(v_sync.counterparty_name, 'Unknown'),
      NULLIF(v_sync.contact_number, ''),
      NULLIF(v_sync.state, ''),
      v_order_date,
      v_total,
      v_qty,
      v_unit_price,
      (SELECT id FROM public.products WHERE UPPER(code) = 'USDT' LIMIT 1),
      v_wallet_id,
      COALESCE(v_sync.order_data->>'wallet_name', 'Binance'),
      0,
      v_commission,
      v_total,
      'd8a803ad-6169-4f1f-9557-b1c92dcaf221',
      'COMPLETED',
      'COMPLETED',
      'PENDING',
      FALSE,
      'Terminal P2P Sale - ' || v_sync.binance_order_number || ' | corrective relink',
      v_user_id,
      'terminal',
      '67af65fe-3c98-4334-80cd-4f491dca445d',
      v_sync.client_id
    )
    RETURNING id INTO v_sales_order_id;
  END IF;

  UPDATE public.terminal_sales_sync
  SET sales_order_id = v_sales_order_id,
      sync_status = 'approved',
      reviewed_by = COALESCE(reviewed_by, v_user_text),
      reviewed_at = COALESCE(reviewed_at, now())
  WHERE id = '67af65fe-3c98-4334-80cd-4f491dca445d';

  IF v_wallet_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE reference_id = v_sales_order_id
        AND reference_type = 'SALES_ORDER'
    ) AND v_net_qty > 0 THEN
      PERFORM public.process_sales_order_wallet_deduction(v_wallet_id, v_net_qty, v_sales_order_id, v_asset);
    END IF;

    IF v_commission > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.wallet_transactions
         WHERE reference_id = v_sales_order_id
           AND reference_type = 'SALES_ORDER_FEE'
       ) THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, balance_before, balance_after, asset_code
      ) VALUES (
        v_wallet_id,
        'DEBIT',
        v_commission,
        'SALES_ORDER_FEE',
        v_sales_order_id,
        'Platform fee for sales order #' || (SELECT order_number FROM public.sales_orders WHERE id = v_sales_order_id) || ' (Binance commission)',
        0,
        0,
        v_asset
      );
    END IF;
  END IF;
END
$$;