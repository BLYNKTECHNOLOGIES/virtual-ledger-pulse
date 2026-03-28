
-- W17 FIX: Update flag_reason on every breach (not just first), and always create monthly task
CREATE OR REPLACE FUNCTION public.check_counterparty_volume_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_monthly_volume numeric;
  v_limit numeric;
  v_nickname text;
  v_month_label text;
BEGIN
  -- For UPDATE: only proceed if transitioning TO completed
  IF TG_OP = 'UPDATE' AND OLD.order_status ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

  IF NEW.order_status NOT ILIKE '%COMPLETED%' THEN
    RETURN NEW;
  END IF;

  SELECT 
    COALESCE(SUM(por.total_price), 0),
    COALESCE(pc.monthly_volume_limit, 200000),
    pc.binance_nickname
  INTO v_monthly_volume, v_limit, v_nickname
  FROM p2p_counterparties pc
  LEFT JOIN p2p_order_records por ON por.counterparty_id = pc.id
    AND por.order_status ILIKE '%COMPLETED%'
    AND por.binance_create_time >= EXTRACT(EPOCH FROM date_trunc('month', now())) * 1000
  WHERE pc.id = NEW.counterparty_id
  GROUP BY pc.monthly_volume_limit, pc.binance_nickname;

  IF v_monthly_volume > v_limit THEN
    v_month_label := to_char(now(), 'Mon-YYYY');

    -- Always update flag_reason with latest volume (not just first breach)
    UPDATE p2p_counterparties
    SET is_flagged = true,
        flag_reason = 'Monthly volume ₹' || round(v_monthly_volume)::text || ' exceeds limit ₹' || round(v_limit)::text ||
          ' (updated ' || to_char(now(), 'DD-Mon-YYYY HH24:MI') || ')'
    WHERE id = NEW.counterparty_id;

    -- Create task per month (not per counterparty lifetime)
    IF NOT EXISTS (
      SELECT 1 FROM erp_tasks
      WHERE title = 'P2P volume breach: ' || COALESCE(v_nickname, NEW.counterparty_nickname) || ' [' || v_month_label || ']'
        AND status NOT IN ('completed', 'cancelled')
    ) THEN
      INSERT INTO erp_tasks (title, description, priority, status, tags)
      VALUES (
        'P2P volume breach: ' || COALESCE(v_nickname, NEW.counterparty_nickname) || ' [' || v_month_label || ']',
        'Counterparty ' || COALESCE(v_nickname, NEW.counterparty_nickname) || 
        ' has crossed monthly volume limit of ₹' || round(v_limit)::text || 
        '. Current month volume: ₹' || round(v_monthly_volume)::text || 
        '. KYC/compliance review required.',
        'high', 'open',
        ARRAY['compliance', 'p2p', 'volume-breach', 'auto-flagged']
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- W18 FIX: Read from wallet_asset_balances instead of SUM aggregation
CREATE OR REPLACE FUNCTION public.process_sales_order_wallet_deduction(
  wallet_id uuid, usdt_amount numeric, sales_order_id uuid, 
  p_asset_code text DEFAULT 'USDT'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_bal NUMERIC;
  wallet_transaction_id UUID;
BEGIN
  -- Read balance from wallet_asset_balances (single row lookup, trigger-maintained)
  SELECT COALESCE(wab.balance, 0) INTO current_bal
  FROM public.wallet_asset_balances wab
  WHERE wab.wallet_id = process_sales_order_wallet_deduction.wallet_id
    AND wab.asset_code = p_asset_code;

  -- If no row exists in wallet_asset_balances, balance is 0
  IF current_bal IS NULL THEN
    current_bal := 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE id = process_sales_order_wallet_deduction.wallet_id AND is_active = true) THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  IF current_bal < usdt_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Required: %', ROUND(current_bal, 4), ROUND(usdt_amount, 4);
  END IF;
  
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount, reference_type, reference_id,
    description, balance_before, balance_after, asset_code
  ) VALUES (
    process_sales_order_wallet_deduction.wallet_id, 'DEBIT', usdt_amount, 'SALES_ORDER', sales_order_id,
    p_asset_code || ' sold via sales order',
    current_bal, current_bal - usdt_amount, p_asset_code
  ) RETURNING id INTO wallet_transaction_id;
  
  RETURN true;
END;
$function$;
