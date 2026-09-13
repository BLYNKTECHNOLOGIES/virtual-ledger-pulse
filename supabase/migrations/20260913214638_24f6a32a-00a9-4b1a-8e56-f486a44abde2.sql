CREATE OR REPLACE FUNCTION public.prune_terminal_telemetry(p_batch integer DEFAULT 20000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline integer := 0;
  v_runs integer := 0;
  v_ads integer := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.p2p_release_deadline_monitor_log
    WHERE ctid IN (
      SELECT ctid FROM public.p2p_release_deadline_monitor_log
      WHERE checked_at < now() - interval '30 days'
      LIMIT p_batch
    ) RETURNING 1
  ) SELECT count(*) INTO v_deadline FROM d;

  WITH d AS (
    DELETE FROM public.p2p_auto_pay_engine_runs
    WHERE ctid IN (
      SELECT ctid FROM public.p2p_auto_pay_engine_runs
      WHERE started_at < now() - interval '30 days'
      LIMIT p_batch
    ) RETURNING 1
  ) SELECT count(*) INTO v_runs FROM d;

  WITH d AS (
    DELETE FROM public.binance_ad_state_snapshots
    WHERE ctid IN (
      SELECT ctid FROM public.binance_ad_state_snapshots
      WHERE captured_at < now() - interval '30 days'
      LIMIT p_batch
    ) RETURNING 1
  ) SELECT count(*) INTO v_ads FROM d;

  RETURN jsonb_build_object(
    'release_deadline_log', v_deadline,
    'auto_pay_runs', v_runs,
    'ad_state_snapshots', v_ads
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_terminal_telemetry(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_terminal_telemetry(integer) TO service_role;

-- Nightly at 22:00 UTC (03:30 IST) — off-peak.
SELECT cron.schedule('prune-terminal-telemetry-daily', '0 22 * * *',
  $cron$ SELECT public.prune_terminal_telemetry(50000); $cron$);

-- High-churn terminal tables: vacuum sooner so dead rows never pile up.
ALTER TABLE public.p2p_release_deadline_monitor_log SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.p2p_auto_pay_engine_runs        SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.binance_ad_state_snapshots      SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.binance_order_chat_messages     SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.terminal_active_orders_cache    SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.erp_balance_snapshot_lines      SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE public.cp_order_identity               SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE public.order_nickname_registry         SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE public.p2p_order_records               SET (autovacuum_vacuum_scale_factor = 0.05);
