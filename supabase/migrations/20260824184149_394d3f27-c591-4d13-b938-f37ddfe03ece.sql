CREATE OR REPLACE FUNCTION generate_pricing_effectiveness_snapshot(p_date date DEFAULT CURRENT_DATE - 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO ad_pricing_effectiveness_snapshots (
    rule_id, snapshot_date, total_price_updates,
    avg_applied_price, avg_competitor_price, avg_spread,
    orders_received, orders_completed, total_volume,
    competitor_zone, competitor_identity
  )
  SELECT
    l.rule_id,
    p_date,
    count(*) FILTER (WHERE l.status = 'applied'),
    avg(l.applied_price) FILTER (WHERE l.applied_price IS NOT NULL),
    avg(l.competitor_price) FILTER (WHERE l.competitor_price IS NOT NULL),
    avg(l.applied_price - l.competitor_price) FILTER (WHERE l.applied_price IS NOT NULL AND l.competitor_price IS NOT NULL),
    coalesce((
      SELECT count(DISTINCT o.order_number)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
    ), 0),
    coalesce((
      SELECT count(DISTINCT o.order_number)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
        AND o.order_status IN ('COMPLETED', '4')
    ), 0),
    coalesce((
      SELECT sum(o.total_price::numeric)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
        AND o.order_status IN ('COMPLETED', '4')
    ), 0),
    -- Dominant zone the rule actually competed in on that day
    (SELECT lz.zone FROM (
       SELECT lower(coalesce(l2.competitor_zone, l2.ad_zone)) AS zone, count(*) AS c
       FROM ad_pricing_logs l2
       WHERE l2.rule_id = l.rule_id AND l2.created_at::date = p_date
         AND coalesce(l2.competitor_zone, l2.ad_zone) IS NOT NULL
       GROUP BY 1 ORDER BY c DESC LIMIT 1
     ) lz),
    -- Dominant matched merchant level on that day
    (SELECT li.identity FROM (
       SELECT l3.competitor_identity AS identity, count(*) AS c
       FROM ad_pricing_logs l3
       WHERE l3.rule_id = l.rule_id AND l3.created_at::date = p_date
         AND l3.competitor_identity IS NOT NULL
       GROUP BY 1 ORDER BY c DESC LIMIT 1
     ) li)
  FROM ad_pricing_logs l
  JOIN ad_pricing_rules r ON r.id = l.rule_id
  WHERE l.created_at::date = p_date
  GROUP BY l.rule_id, r.ad_numbers
  ON CONFLICT (rule_id, snapshot_date) DO UPDATE SET
    total_price_updates = EXCLUDED.total_price_updates,
    avg_applied_price = EXCLUDED.avg_applied_price,
    avg_competitor_price = EXCLUDED.avg_competitor_price,
    avg_spread = EXCLUDED.avg_spread,
    orders_received = EXCLUDED.orders_received,
    orders_completed = EXCLUDED.orders_completed,
    total_volume = EXCLUDED.total_volume,
    competitor_zone = EXCLUDED.competitor_zone,
    competitor_identity = EXCLUDED.competitor_identity;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;