UPDATE public.binance_order_history
SET
  adv_no = COALESCE(NULLIF(adv_no, ''), raw_data->>'advNo'),
  trade_type = COALESCE(NULLIF(trade_type, ''), raw_data->>'tradeType'),
  asset = COALESCE(NULLIF(asset, ''), raw_data->>'asset', 'USDT'),
  fiat_unit = COALESCE(NULLIF(fiat_unit, ''), raw_data->>'fiat', raw_data->>'fiatUnit', 'INR'),
  amount = CASE
    WHEN COALESCE(NULLIF(amount, ''), '0')::numeric <= 0 AND NULLIF(raw_data->>'amount', '') IS NOT NULL THEN raw_data->>'amount'
    ELSE amount
  END,
  total_price = CASE
    WHEN COALESCE(NULLIF(total_price, ''), '0')::numeric <= 0 AND NULLIF(raw_data->>'totalPrice', '') IS NOT NULL THEN raw_data->>'totalPrice'
    ELSE total_price
  END,
  unit_price = CASE
    WHEN COALESCE(NULLIF(unit_price, ''), '0')::numeric <= 0
      AND NULLIF(raw_data->>'price', '') IS NOT NULL THEN raw_data->>'price'
    WHEN COALESCE(NULLIF(unit_price, ''), '0')::numeric <= 0
      AND NULLIF(raw_data->>'totalPrice', '') IS NOT NULL
      AND NULLIF(raw_data->>'amount', '') IS NOT NULL
      AND (raw_data->>'amount')::numeric > 0 THEN ((raw_data->>'totalPrice')::numeric / (raw_data->>'amount')::numeric)::text
    ELSE unit_price
  END,
  commission = CASE
    WHEN COALESCE(NULLIF(commission, ''), '0')::numeric <= 0 AND NULLIF(raw_data->>'commission', '') IS NOT NULL THEN raw_data->>'commission'
    ELSE commission
  END,
  counter_part_nick_name = COALESCE(NULLIF(counter_part_nick_name, ''), raw_data->>'counterPartNickName', raw_data->>'sellerNickname', raw_data->>'buyerNickname'),
  synced_at = now()
WHERE raw_data IS NOT NULL
  AND (
    COALESCE(NULLIF(amount, ''), '0')::numeric <= 0
    OR COALESCE(NULLIF(total_price, ''), '0')::numeric <= 0
    OR COALESCE(NULLIF(unit_price, ''), '0')::numeric <= 0
    OR adv_no IS NULL OR adv_no = ''
    OR counter_part_nick_name IS NULL OR counter_part_nick_name = ''
  );

UPDATE public.p2p_order_records por
SET
  amount = CASE WHEN por.amount <= 0 AND COALESCE(NULLIF(boh.amount, ''), '0')::numeric > 0 THEN boh.amount::numeric ELSE por.amount END,
  total_price = CASE WHEN por.total_price <= 0 AND COALESCE(NULLIF(boh.total_price, ''), '0')::numeric > 0 THEN boh.total_price::numeric ELSE por.total_price END,
  unit_price = CASE
    WHEN por.unit_price <= 0 AND COALESCE(NULLIF(boh.unit_price, ''), '0')::numeric > 0 THEN boh.unit_price::numeric
    WHEN por.unit_price <= 0 AND COALESCE(NULLIF(boh.total_price, ''), '0')::numeric > 0 AND COALESCE(NULLIF(boh.amount, ''), '0')::numeric > 0 THEN boh.total_price::numeric / boh.amount::numeric
    ELSE por.unit_price
  END,
  commission = CASE WHEN por.commission <= 0 AND COALESCE(NULLIF(boh.commission, ''), '0')::numeric > 0 THEN boh.commission::numeric ELSE por.commission END,
  order_status = CASE
    WHEN boh.order_status ILIKE '%COMPLETED%' OR boh.order_status ILIKE '%CANCEL%' OR boh.order_status ILIKE '%EXPIRED%' OR boh.order_status ILIKE '%APPEAL%' THEN boh.order_status
    ELSE por.order_status
  END,
  completed_at = CASE WHEN boh.order_status ILIKE '%COMPLETED%' AND por.completed_at IS NULL THEN now() ELSE por.completed_at END,
  cancelled_at = CASE WHEN boh.order_status ILIKE '%CANCEL%' AND por.cancelled_at IS NULL THEN now() ELSE por.cancelled_at END,
  synced_at = now(),
  updated_at = now()
FROM public.binance_order_history boh
WHERE boh.order_number = por.binance_order_number
  AND (
    por.amount <= 0
    OR por.total_price <= 0
    OR por.unit_price <= 0
    OR (
      (boh.order_status ILIKE '%COMPLETED%' OR boh.order_status ILIKE '%CANCEL%' OR boh.order_status ILIKE '%EXPIRED%' OR boh.order_status ILIKE '%APPEAL%')
      AND por.order_status IS DISTINCT FROM boh.order_status
    )
  );