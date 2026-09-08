CREATE OR REPLACE FUNCTION public.get_terminal_order_summary(
  p_start_ms bigint,
  p_end_ms bigint,
  p_accounts uuid[],
  p_windows jsonb DEFAULT '[]'::jsonb,
  p_sealed_cutoff_ms bigint DEFAULT NULL
)
RETURNS TABLE (
  day_ist date,
  trade_type text,
  status_group text,
  asset text,
  order_count bigint,
  fiat_volume numeric,
  asset_qty numeric,
  commission numeric,
  appeal_count bigint,
  source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win AS (
    SELECT (w->>0)::bigint AS ws, (w->>1)::bigint AS we
    FROM jsonb_array_elements(coalesce(nullif(p_windows, 'null'::jsonb), '[]'::jsonb)) w
  ),
  bounds AS (
    SELECT
      -- sealed buckets start at the first whole bucket inside the range
      (ceil(p_start_ms / 1800000.0) * 1800000)::bigint AS sealed_from,
      -- sealed/live split aligned down to a whole bucket so nothing is double counted
      (floor(
         least(
           p_end_ms,
           coalesce(p_sealed_cutoff_ms, (extract(epoch FROM now()) * 1000)::bigint - 45 * 86400000::bigint)
         ) / 1800000.0
       ) * 1800000)::bigint AS sealed_to
  ),
  sealed AS (
    SELECT
      ((r.bucket_start AT TIME ZONE 'Asia/Kolkata')::date) AS day_ist,
      r.trade_type, r.status_group, r.asset,
      sum(r.order_count)::bigint AS order_count,
      sum(r.fiat_volume) AS fiat_volume,
      sum(r.asset_qty) AS asset_qty,
      sum(r.commission) AS commission,
      sum(r.appeal_count)::bigint AS appeal_count,
      'rollup'::text AS source
    FROM public.terminal_order_rollups r, bounds
    WHERE r.exchange_account_id = ANY (p_accounts)
      AND (extract(epoch FROM r.bucket_start) * 1000)::bigint >= bounds.sealed_from
      AND (extract(epoch FROM r.bucket_start) * 1000)::bigint <  bounds.sealed_to
      AND (
        NOT EXISTS (SELECT 1 FROM win)
        OR EXISTS (
          SELECT 1 FROM win
          WHERE (extract(epoch FROM r.bucket_start) * 1000)::bigint >= win.ws
            AND (extract(epoch FROM r.bucket_start) * 1000)::bigint <  win.we
        )
      )
    GROUP BY 1, 2, 3, 4
  ),
  live AS (
    SELECT
      ((to_timestamp(o.create_time / 1000.0) AT TIME ZONE 'Asia/Kolkata')::date) AS day_ist,
      upper(coalesce(o.trade_type, 'UNKNOWN')) AS trade_type,
      public.terminal_order_status_group(o.order_status) AS status_group,
      upper(coalesce(o.asset, 'UNKNOWN')) AS asset,
      count(*)::bigint AS order_count,
      sum(coalesce(nullif(o.total_price, '')::numeric, 0)) AS fiat_volume,
      sum(coalesce(nullif(o.amount, '')::numeric, 0)) AS asset_qty,
      sum(coalesce(nullif(o.commission, '')::numeric, 0)) AS commission,
      count(*) FILTER (
        WHERE o.has_active_complaint IS TRUE
           OR upper(coalesce(o.order_status, '')) LIKE '%APPEAL%'
           OR upper(coalesce(o.order_status, '')) LIKE '%COMPLAINT%'
      )::bigint AS appeal_count,
      'live'::text AS source
    FROM public.binance_order_history o, bounds
    WHERE o.exchange_account_id = ANY (p_accounts)
      AND o.create_time >= p_start_ms
      AND o.create_time <= p_end_ms
      -- everything outside the sealed bucket span comes straight from raw rows
      AND (o.create_time < bounds.sealed_from OR o.create_time >= bounds.sealed_to)
      AND (
        NOT EXISTS (SELECT 1 FROM win)
        OR EXISTS (SELECT 1 FROM win WHERE o.create_time >= win.ws AND o.create_time <= win.we)
      )
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM sealed
  UNION ALL
  SELECT * FROM live;
$$;

REVOKE ALL ON FUNCTION public.get_terminal_order_summary(bigint, bigint, uuid[], jsonb, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.get_terminal_order_summary(bigint, bigint, uuid[], jsonb, bigint) TO authenticated, service_role;