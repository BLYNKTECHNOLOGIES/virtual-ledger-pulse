CREATE TABLE IF NOT EXISTS public.terminal_order_rollups (
  bucket_start timestamptz NOT NULL,
  exchange_account_id uuid NOT NULL,
  trade_type text NOT NULL,
  asset text NOT NULL,
  status_group text NOT NULL,
  order_count integer NOT NULL DEFAULT 0,
  fiat_volume numeric NOT NULL DEFAULT 0,
  asset_qty numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  price_qty_sum numeric NOT NULL DEFAULT 0,
  appeal_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_start, exchange_account_id, trade_type, asset, status_group)
);

GRANT SELECT ON public.terminal_order_rollups TO authenticated;
GRANT ALL ON public.terminal_order_rollups TO service_role;

ALTER TABLE public.terminal_order_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read order rollups"
ON public.terminal_order_rollups FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_terminal_order_rollups_bucket
  ON public.terminal_order_rollups (bucket_start);

CREATE INDEX IF NOT EXISTS idx_binance_order_history_create_time
  ON public.binance_order_history (create_time);

-- Status grouping shared by the rollup builder and the live tail reader
CREATE OR REPLACE FUNCTION public.terminal_order_status_group(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN upper(coalesce(p_status, '')) LIKE '%COMPLETED%'
      OR upper(coalesce(p_status, '')) LIKE '%RELEASED%' THEN 'COMPLETED'
    WHEN upper(coalesce(p_status, '')) = 'CANCELLED_BY_SYSTEM' THEN 'AUTO_CANCELLED'
    WHEN upper(coalesce(p_status, '')) LIKE '%CANCEL%' THEN 'CANCELLED'
    WHEN upper(coalesce(p_status, '')) LIKE '%EXPIRED%'
      OR upper(coalesce(p_status, '')) LIKE '%TIMEOUT%' THEN 'EXPIRED'
    ELSE 'OTHER'
  END
$$;

CREATE OR REPLACE FUNCTION public.rebuild_terminal_order_rollups(p_from_ms bigint, p_to_ms bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz := to_timestamp(floor(p_from_ms / 1800000.0) * 1800);
  v_to   timestamptz := to_timestamp(ceil(p_to_ms / 1800000.0) * 1800);
  v_count integer;
BEGIN
  DELETE FROM public.terminal_order_rollups
   WHERE bucket_start >= v_from AND bucket_start < v_to;

  INSERT INTO public.terminal_order_rollups (
    bucket_start, exchange_account_id, trade_type, asset, status_group,
    order_count, fiat_volume, asset_qty, commission, price_qty_sum, appeal_count, updated_at
  )
  SELECT
    to_timestamp(floor(create_time / 1800000.0) * 1800),
    exchange_account_id,
    upper(coalesce(trade_type, 'UNKNOWN')),
    upper(coalesce(asset, 'UNKNOWN')),
    public.terminal_order_status_group(order_status),
    count(*),
    sum(coalesce(nullif(total_price, '')::numeric, 0)),
    sum(coalesce(nullif(amount, '')::numeric, 0)),
    sum(coalesce(nullif(commission, '')::numeric, 0)),
    sum(coalesce(nullif(unit_price, '')::numeric, 0) * coalesce(nullif(amount, '')::numeric, 0)),
    count(*) FILTER (
      WHERE has_active_complaint IS TRUE
         OR upper(coalesce(order_status, '')) LIKE '%APPEAL%'
         OR upper(coalesce(order_status, '')) LIKE '%COMPLAINT%'
    ),
    now()
  FROM public.binance_order_history
  WHERE create_time >= (extract(epoch FROM v_from) * 1000)::bigint
    AND create_time <  (extract(epoch FROM v_to) * 1000)::bigint
    AND exchange_account_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_terminal_order_rollups(bigint, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.rebuild_terminal_order_rollups(bigint, bigint) TO authenticated, service_role;

-- Combined reader: sealed buckets (older than the sealed cutoff) + raw recent rows.
-- p_windows is a JSON array of [startMs, endMs] pairs (shift slices); an empty
-- array means the whole [p_start_ms, p_end_ms] span.
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
  cutoff AS (
    SELECT coalesce(p_sealed_cutoff_ms, (extract(epoch FROM now()) * 1000)::bigint - 45 * 86400000) AS c
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
    FROM public.terminal_order_rollups r, cutoff
    WHERE r.exchange_account_id = ANY (p_accounts)
      AND (extract(epoch FROM r.bucket_start) * 1000)::bigint >= p_start_ms
      AND (extract(epoch FROM r.bucket_start) * 1000)::bigint <  least(p_end_ms, cutoff.c)
      AND (
        NOT EXISTS (SELECT 1 FROM win)
        OR EXISTS (
          SELECT 1 FROM win
          WHERE (extract(epoch FROM r.bucket_start) * 1000)::bigint >= win.ws
            AND (extract(epoch FROM r.bucket_start) * 1000)::bigint <= win.we
        )
      )
    GROUP BY 1, 2, 3, 4
  ),
  tail AS (
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
    FROM public.binance_order_history o, cutoff
    WHERE o.exchange_account_id = ANY (p_accounts)
      AND o.create_time >= greatest(p_start_ms, cutoff.c)
      AND o.create_time <= p_end_ms
      AND (
        NOT EXISTS (SELECT 1 FROM win)
        OR EXISTS (SELECT 1 FROM win WHERE o.create_time >= win.ws AND o.create_time <= win.we)
      )
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM sealed
  UNION ALL
  SELECT * FROM tail;
$$;

REVOKE ALL ON FUNCTION public.get_terminal_order_summary(bigint, bigint, uuid[], jsonb, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.get_terminal_order_summary(bigint, bigint, uuid[], jsonb, bigint) TO authenticated, service_role;