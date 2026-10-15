-- TAN-2 · Terminal Analytics backend fixes (AF1, AF2). Safe to run more than once.
-- Fail fast instead of queueing behind a long write on the snapshot table.
SET LOCAL lock_timeout = '10s';

-- ─── AF1 · Zone history ───────────────────────────────────────────────────────
-- terminal_ad_zone_map() used to read every ad state snapshot (1.5 M rows, 3.7 GB,
-- ~68 s) and always hit the 8 s timeout. The nightly 30-day snapshot prune also
-- erased the zone of every ad closed more than 30 days ago, while orders on those
-- ads are kept for a year. Keep the last zone Binance reported per ad instead.

CREATE TABLE IF NOT EXISTS public.terminal_ad_zone_latest (
  adv_no      text PRIMARY KEY,
  zone        text NOT NULL CHECK (zone IN ('block', 'p2p')),
  classify    text,
  captured_at timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.terminal_ad_zone_latest IS
  'Last Binance classify (zone) per ad, from binance_ad_state_snapshots. Kept by trigger plus hourly and nightly catch-ups; survives the 30-day snapshot prune. Read through terminal_ad_zone_map().';

ALTER TABLE public.terminal_ad_zone_latest ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.terminal_ad_zone_latest FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.terminal_ad_zone_latest TO authenticated;
GRANT ALL ON public.terminal_ad_zone_latest TO service_role;

DROP POLICY IF EXISTS "Authenticated users can view ad zone history" ON public.terminal_ad_zone_latest;
CREATE POLICY "Authenticated users can view ad zone history"
  ON public.terminal_ad_zone_latest
  FOR SELECT
  TO authenticated
  USING (true);

-- Same rule as before: the latest snapshot that has a classify key wins;
-- 'block' (any case) is the block zone, everything else is P2P.
CREATE OR REPLACE FUNCTION public.capture_terminal_ad_zone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.terminal_ad_zone_latest AS z (adv_no, zone, classify, captured_at, updated_at)
  SELECT DISTINCT ON (n.adv_no)
         n.adv_no,
         CASE WHEN lower(coalesce(n.raw_payload->>'classify', '')) = 'block' THEN 'block' ELSE 'p2p' END,
         n.raw_payload->>'classify',
         n.captured_at,
         now()
  FROM new_rows n
  WHERE n.raw_payload ? 'classify'
  ORDER BY n.adv_no, n.captured_at DESC
  ON CONFLICT (adv_no) DO UPDATE
    SET zone = excluded.zone,
        classify = excluded.classify,
        captured_at = excluded.captured_at,
        updated_at = now()
    WHERE excluded.captured_at >= z.captured_at;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block ad snapshot capture because of this copy; the catch-up jobs below
  -- fill anything missed while the snapshots are still kept (30 days).
  RAISE WARNING 'capture_terminal_ad_zone skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_terminal_ad_zone() FROM PUBLIC, anon, authenticated;

-- CREATE OR REPLACE keeps a re-run to the same lock as the first run.
CREATE OR REPLACE TRIGGER trg_capture_terminal_ad_zone
  AFTER INSERT ON public.binance_ad_state_snapshots
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.capture_terminal_ad_zone();

-- Catch-up: for every ad with snapshots, the latest one with a classify key captured
-- within p_since (one index probe per ad, not a scan). Returns the rows changed.
-- Runs as its caller: the migration and pg_cron run as the owner; nobody else may call it.
CREATE OR REPLACE FUNCTION public.refresh_terminal_ad_zone_latest(p_since interval DEFAULT interval '3 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed integer := 0;
BEGIN
  WITH RECURSIVE ads AS (
    (SELECT s.adv_no FROM public.binance_ad_state_snapshots s ORDER BY s.adv_no LIMIT 1)
    UNION ALL
    SELECT (SELECT s.adv_no FROM public.binance_ad_state_snapshots s WHERE s.adv_no > ads.adv_no ORDER BY s.adv_no LIMIT 1)
    FROM ads
    WHERE ads.adv_no IS NOT NULL
  ),
  upserted AS (
    INSERT INTO public.terminal_ad_zone_latest AS z (adv_no, zone, classify, captured_at)
    SELECT ads.adv_no, l.zone, l.classify, l.captured_at
    FROM ads
    CROSS JOIN LATERAL (
      SELECT CASE WHEN lower(coalesce(s.raw_payload->>'classify', '')) = 'block' THEN 'block' ELSE 'p2p' END AS zone,
             s.raw_payload->>'classify' AS classify,
             s.captured_at
      FROM public.binance_ad_state_snapshots s
      WHERE s.adv_no = ads.adv_no
        AND s.captured_at > now() - p_since
        AND s.raw_payload ? 'classify'
      ORDER BY s.captured_at DESC
      LIMIT 1
    ) l
    WHERE ads.adv_no IS NOT NULL
    ON CONFLICT (adv_no) DO UPDATE
      SET zone = excluded.zone, classify = excluded.classify, captured_at = excluded.captured_at, updated_at = now()
      WHERE excluded.captured_at > z.captured_at
         OR (excluded.captured_at = z.captured_at AND excluded.zone IS DISTINCT FROM z.zone)
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM upserted;
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_terminal_ad_zone_latest(interval) FROM PUBLIC, anon, authenticated;

-- First fill from every snapshot kept today (~20 ms on live data).
SELECT public.refresh_terminal_ad_zone_latest(interval '100 years');

-- Ads whose last snapshot was due to be pruned (values read from the snapshots on
-- 16 Oct 2026 01:58 IST). Ignored for any ad that has a newer snapshot.
INSERT INTO public.terminal_ad_zone_latest AS z (adv_no, zone, classify, captured_at)
VALUES
  ('13909661805204885504', 'p2p',   'profession', '2026-09-14 15:13:10.707429+00'),
  ('12933108531673411584', 'block', 'block',      '2026-09-15 10:11:14.040581+00'),
  ('13930916412007194624', 'p2p',   'profession', '2026-09-15 19:26:45.311231+00'),
  ('13933177566637285376', 'p2p',   'profession', '2026-09-16 06:53:08.133263+00'),
  ('13933433463619543040', 'p2p',   'profession', '2026-09-19 08:36:32.557972+00'),
  ('13935255166585602048', 'p2p',   'profession', '2026-09-21 11:02:51.504845+00')
ON CONFLICT (adv_no) DO UPDATE
  SET zone = excluded.zone, classify = excluded.classify, captured_at = excluded.captured_at, updated_at = now()
  WHERE excluded.captured_at > z.captured_at;

-- Safety nets for snapshots the trigger skipped (a job name that exists is updated, not duplicated):
-- hourly over the last 3 days, and nightly over everything still kept, just before the 22:00 UTC prune.
SELECT cron.schedule('terminal-ad-zone-catch-up', '17 * * * *', $cron$ SELECT public.refresh_terminal_ad_zone_latest(); $cron$);
SELECT cron.schedule('terminal-ad-zone-catch-up-nightly', '47 21 * * *', $cron$ SELECT public.refresh_terminal_ad_zone_latest(interval '35 days'); $cron$);

-- Same name, arguments, return columns, SECURITY INVOKER and grants as before.
-- Ordered so callers can page past PostgREST's 1,000-row limit as the table grows.
CREATE OR REPLACE FUNCTION public.terminal_ad_zone_map()
RETURNS TABLE(adv_no text, zone text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT z.adv_no, z.zone
  FROM public.terminal_ad_zone_latest z
  ORDER BY z.adv_no
$$;

-- ─── AF2 · Order valuations in one round trip ────────────────────────────────
-- Terminal → Analytics read valuations with ~1,900 requests for one year
-- (4 tables × chunks of 150 order numbers, one after another). This returns the
-- same rows those requests return, for a whole list of order numbers, so the page
-- keeps its own valuation rules. SECURITY INVOKER: the caller's row-level
-- security applies exactly as it does to the table reads it replaces.
CREATE OR REPLACE FUNCTION public.terminal_order_valuation_rows(p_order_numbers text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH
  purchase_sync AS (
    SELECT t.binance_order_number, t.purchase_order_id
    FROM public.terminal_purchase_sync t
    WHERE t.binance_order_number = ANY (p_order_numbers)
  ),
  sales_sync AS (
    SELECT t.binance_order_number, t.sales_order_id
    FROM public.terminal_sales_sync t
    WHERE t.binance_order_number = ANY (p_order_numbers)
  ),
  small_buy_map AS (
    SELECT m.binance_order_number, m.order_data, m.small_buys_sync_id
    FROM public.small_buys_order_map m
    WHERE m.binance_order_number = ANY (p_order_numbers)
  ),
  small_sale_map AS (
    SELECT m.binance_order_number, m.order_data, m.small_sales_sync_id
    FROM public.small_sales_order_map m
    WHERE m.binance_order_number = ANY (p_order_numbers)
  ),
  small_buy_sync AS (
    SELECT s.id, s.total_quantity, s.purchase_order_id
    FROM public.small_buys_sync s
    WHERE s.id IN (SELECT small_buys_sync_id FROM small_buy_map)
  ),
  small_sale_sync AS (
    SELECT s.id, s.total_quantity, s.sales_order_id
    FROM public.small_sales_sync s
    WHERE s.id IN (SELECT small_sales_sync_id FROM small_sale_map)
  )
  SELECT jsonb_build_object(
    'purchase_sync', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'binance_order_number', ps.binance_order_number,
        'purchase_orders', (
          SELECT jsonb_build_object('effective_usdt_qty', po.effective_usdt_qty, 'effective_usdt_rate', po.effective_usdt_rate, 'market_rate_usdt', po.market_rate_usdt)
          FROM public.purchase_orders po
          WHERE po.id = ps.purchase_order_id)))
      FROM purchase_sync ps), '[]'::jsonb),
    'sales_sync', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'binance_order_number', ss.binance_order_number,
        'sales_orders', (
          SELECT jsonb_build_object('effective_usdt_qty', so.effective_usdt_qty, 'effective_usdt_rate', so.effective_usdt_rate, 'market_rate_usdt', so.market_rate_usdt)
          FROM public.sales_orders so
          WHERE so.id = ss.sales_order_id)))
      FROM sales_sync ss), '[]'::jsonb),
    'small_buy_map', coalesce((
      SELECT jsonb_agg(jsonb_build_object('binance_order_number', m.binance_order_number, 'order_data', m.order_data, 'small_buys_sync_id', m.small_buys_sync_id))
      FROM small_buy_map m), '[]'::jsonb),
    'small_sale_map', coalesce((
      SELECT jsonb_agg(jsonb_build_object('binance_order_number', m.binance_order_number, 'order_data', m.order_data, 'small_sales_sync_id', m.small_sales_sync_id))
      FROM small_sale_map m), '[]'::jsonb),
    'small_buy_sync', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'total_quantity', s.total_quantity, 'purchase_order_id', s.purchase_order_id))
      FROM small_buy_sync s), '[]'::jsonb),
    'small_sale_sync', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'total_quantity', s.total_quantity, 'sales_order_id', s.sales_order_id))
      FROM small_sale_sync s), '[]'::jsonb),
    'small_buy_orders', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', po.id, 'effective_usdt_qty', po.effective_usdt_qty, 'effective_usdt_rate', po.effective_usdt_rate, 'market_rate_usdt', po.market_rate_usdt, 'quantity', po.quantity))
      FROM public.purchase_orders po
      WHERE po.id IN (SELECT purchase_order_id FROM small_buy_sync)), '[]'::jsonb),
    'small_sale_orders', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', so.id, 'effective_usdt_qty', so.effective_usdt_qty, 'effective_usdt_rate', so.effective_usdt_rate, 'market_rate_usdt', so.market_rate_usdt, 'quantity', so.quantity))
      FROM public.sales_orders so
      WHERE so.id IN (SELECT sales_order_id FROM small_sale_sync)), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.terminal_order_valuation_rows(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminal_order_valuation_rows(text[]) TO authenticated, service_role;