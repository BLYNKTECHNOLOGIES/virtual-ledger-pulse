ALTER TABLE public.terminal_mpi_snapshots
  ADD COLUMN IF NOT EXISTS role_type text,
  ADD COLUMN IF NOT EXISTS measurable_work_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stale_lock_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stale_assignment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_after_action_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS median_handle_time_minutes numeric,
  ADD COLUMN IF NOT EXISTS fastest_handle_time_minutes numeric,
  ADD COLUMN IF NOT EXISTS slowest_handle_time_minutes numeric,
  ADD COLUMN IF NOT EXISTS data_confidence numeric,
  ADD COLUMN IF NOT EXISTS source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_quality jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.terminal_mpi_snapshots
  ALTER COLUMN mpi_score DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_terminal_payer_order_log_user_date
  ON public.terminal_payer_order_log (payer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_payer_order_log_order_action
  ON public.terminal_payer_order_log (order_number, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_payer_order_locks_user_date_status
  ON public.terminal_payer_order_locks (payer_user_id, locked_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_terminal_order_assignments_user_date_active
  ON public.terminal_order_assignments (assigned_to, created_at DESC, is_active);

CREATE INDEX IF NOT EXISTS idx_binance_order_history_order_status_trade
  ON public.binance_order_history (order_number, order_status, trade_type);

CREATE OR REPLACE FUNCTION public.get_terminal_mpi_v2(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text DEFAULT 'all',
  p_requesting_user_id uuid DEFAULT NULL,
  p_can_view_all boolean DEFAULT false,
  p_visible_user_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics jsonb;
  v_summary jsonb;
  v_quality jsonb;
BEGIN
  WITH role_users AS (
    SELECT
      u.id AS user_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
      u.username,
      string_agg(DISTINCT r.name, '/' ORDER BY r.name) FILTER (WHERE lower(r.name) <> 'viewer') AS role_name,
      bool_or(lower(r.name) LIKE '%payer%') AS is_payer,
      bool_or(lower(r.name) LIKE '%operator%') AS is_operator,
      bool_or(lower(r.name) LIKE '%admin%' OR lower(r.name) LIKE '%super%' OR lower(r.name) LIKE '%coo%') AS is_admin
    FROM public.users u
    JOIN public.p2p_terminal_user_roles ur ON ur.user_id = u.id
    JOIN public.p2p_terminal_roles r ON r.id = ur.role_id
    WHERE p_can_view_all
       OR u.id = p_requesting_user_id
       OR (p_visible_user_ids IS NOT NULL AND u.id = ANY(p_visible_user_ids))
    GROUP BY u.id, u.first_name, u.last_name, u.username
  ), scoped_users AS (
    SELECT *,
      CASE
        WHEN is_payer AND is_operator THEN 'hybrid'
        WHEN is_payer THEN 'payer'
        WHEN is_operator THEN 'operator'
        WHEN is_admin THEN 'admin'
        ELSE 'operator'
      END AS role_type
    FROM role_users
  ), payer_events AS (
    SELECT payer_id AS user_id, order_number, min(created_at) AS paid_at
    FROM public.terminal_payer_order_log
    WHERE action = 'marked_paid'
      AND created_at >= p_from AND created_at <= p_to
    GROUP BY payer_id, order_number
  ), lock_scope AS (
    SELECT l.*, pe.paid_at
    FROM public.terminal_payer_order_locks l
    LEFT JOIN payer_events pe ON pe.user_id = l.payer_user_id AND pe.order_number = l.order_number
    WHERE l.locked_at >= p_from AND l.locked_at <= p_to
       OR pe.paid_at IS NOT NULL
       OR (l.status = 'active' AND l.locked_at < p_to)
  ), payer_stats AS (
    SELECT
      su.user_id,
      count(DISTINCT pe.order_number) AS payment_count,
      count(DISTINCT ls.order_number) AS lock_count,
      count(DISTINCT ls.order_number) FILTER (WHERE ls.status = 'completed') AS completed_locks,
      count(DISTINCT ls.order_number) FILTER (WHERE ls.status <> 'completed') AS active_locks,
      count(DISTINCT ls.order_number) FILTER (WHERE ls.status <> 'completed' AND p_to - ls.locked_at > interval '30 minutes') AS stale_locks,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_number IS NOT NULL) AS matched_payment_orders,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_status IN ('CANCELLED','CANCELLED_BY_SYSTEM','EXPIRED','8','9')) AS cancelled_after_action,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_status IN ('IN_APPEAL','APPEAL')) AS appeal_after_action,
      coalesce(sum(nullif(boh.total_price, '')::numeric) FILTER (WHERE pe.order_number IS NOT NULL AND boh.order_number IS NOT NULL), 0) AS payment_volume,
      count(DISTINCT (pe.paid_at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days,
      mode() WITHIN GROUP (ORDER BY extract(hour from pe.paid_at AT TIME ZONE 'Asia/Kolkata')) AS peak_hour,
      array_remove(array_agg(EXTRACT(EPOCH FROM (coalesce(ls.completed_at, pe.paid_at) - ls.locked_at)) / 60.0) FILTER (
        WHERE ls.locked_at IS NOT NULL
          AND coalesce(ls.completed_at, pe.paid_at) IS NOT NULL
          AND coalesce(ls.completed_at, pe.paid_at) > ls.locked_at
          AND coalesce(ls.completed_at, pe.paid_at) - ls.locked_at < interval '1 day'
      ), NULL) AS payer_times
    FROM scoped_users su
    LEFT JOIN payer_events pe ON pe.user_id = su.user_id
    LEFT JOIN lock_scope ls ON ls.payer_user_id = su.user_id AND (ls.order_number = pe.order_number OR pe.order_number IS NULL)
    LEFT JOIN public.binance_order_history boh ON boh.order_number = pe.order_number
    GROUP BY su.user_id
  ), assignment_scope AS (
    SELECT toa.*, boh.order_status, boh.total_price AS history_total_price, boh.trade_type AS history_trade_type
    FROM public.terminal_order_assignments toa
    LEFT JOIN public.binance_order_history boh ON boh.order_number = toa.order_number
    WHERE toa.created_at >= p_from AND toa.created_at <= p_to
       OR (toa.is_active = true AND toa.created_at < p_to)
  ), operator_stats AS (
    SELECT
      su.user_id,
      count(DISTINCT a.order_number) AS assignment_count,
      count(DISTINCT a.order_number) FILTER (WHERE a.order_status = 'COMPLETED' OR (a.order_status IS NULL AND a.is_active = false AND a.assignment_type <> 'cancelled')) AS completed_assignments,
      count(DISTINCT a.order_number) FILTER (WHERE a.order_status IN ('CANCELLED','CANCELLED_BY_SYSTEM','EXPIRED','8','9') OR a.assignment_type = 'cancelled') AS cancelled_assignments,
      count(DISTINCT a.order_number) FILTER (WHERE a.is_active = true) AS active_assignments,
      count(DISTINCT a.order_number) FILTER (WHERE a.is_active = true AND p_to - a.created_at > interval '30 minutes') AS stale_assignments,
      count(DISTINCT a.order_number) FILTER (WHERE a.order_status IN ('IN_APPEAL','APPEAL')) AS appeal_assignments,
      count(DISTINCT a.order_number) FILTER (WHERE a.order_status IS NOT NULL) AS matched_assignment_orders,
      count(DISTINCT a.order_number) FILTER (WHERE coalesce(a.history_trade_type, a.trade_type) = 'BUY') AS buy_count,
      count(DISTINCT a.order_number) FILTER (WHERE coalesce(a.history_trade_type, a.trade_type) = 'SELL') AS sell_count,
      coalesce(sum(coalesce(nullif(a.history_total_price, '')::numeric, a.total_price, 0)), 0) AS assignment_volume,
      count(DISTINCT (a.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days,
      mode() WITHIN GROUP (ORDER BY extract(hour from a.created_at AT TIME ZONE 'Asia/Kolkata')) AS peak_hour,
      array_remove(array_agg(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 60.0) FILTER (
        WHERE a.is_active = false
          AND a.updated_at IS NOT NULL
          AND a.updated_at > a.created_at
          AND a.updated_at - a.created_at < interval '1 day'
      ), NULL) AS operator_times
    FROM scoped_users su
    LEFT JOIN assignment_scope a ON a.assigned_to = su.user_id
    GROUP BY su.user_id
  ), action_quality AS (
    SELECT count(*) AS action_log_count
    FROM public.system_action_logs
    WHERE module = 'terminal'
      AND recorded_at >= p_from AND recorded_at <= p_to
  ), scored AS (
    SELECT
      su.user_id,
      coalesce(nullif(su.full_name, ''), su.username, su.user_id::text) AS display_name,
      coalesce(nullif(su.role_name, ''), 'Terminal User') AS role_name,
      su.role_type,
      coalesce(ps.payment_count, 0) AS payment_count,
      coalesce(ps.lock_count, 0) AS lock_count,
      coalesce(ps.completed_locks, 0) AS completed_locks,
      coalesce(ps.active_locks, 0) AS active_locks,
      coalesce(ps.stale_locks, 0) AS stale_locks,
      coalesce(ps.cancelled_after_action, 0) AS cancelled_after_action,
      coalesce(ps.appeal_after_action, 0) AS payer_appeals,
      coalesce(ps.payment_volume, 0) AS payment_volume,
      coalesce(os.assignment_count, 0) AS assignment_count,
      coalesce(os.completed_assignments, 0) AS completed_assignments,
      coalesce(os.cancelled_assignments, 0) AS cancelled_assignments,
      coalesce(os.active_assignments, 0) AS active_assignments,
      coalesce(os.stale_assignments, 0) AS stale_assignments,
      coalesce(os.appeal_assignments, 0) AS operator_appeals,
      coalesce(os.buy_count, 0) AS buy_count,
      coalesce(os.sell_count, 0) AS sell_count,
      coalesce(os.assignment_volume, 0) AS assignment_volume,
      coalesce(cardinality(ps.payer_times), 0) AS payer_timed_count,
      coalesce(cardinality(os.operator_times), 0) AS operator_timed_count,
      CASE WHEN cardinality(ps.payer_times) > 0 THEN round((SELECT avg(x)::numeric FROM unnest(ps.payer_times) x), 2) END AS payer_avg_minutes,
      CASE WHEN cardinality(ps.payer_times) > 0 THEN round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::numeric FROM unnest(ps.payer_times) x), 2) END AS payer_median_minutes,
      CASE WHEN cardinality(ps.payer_times) > 0 THEN round((SELECT min(x)::numeric FROM unnest(ps.payer_times) x), 2) END AS payer_fastest_minutes,
      CASE WHEN cardinality(ps.payer_times) > 0 THEN round((SELECT max(x)::numeric FROM unnest(ps.payer_times) x), 2) END AS payer_slowest_minutes,
      CASE WHEN cardinality(os.operator_times) > 0 THEN round((SELECT avg(x)::numeric FROM unnest(os.operator_times) x), 2) END AS operator_avg_minutes,
      CASE WHEN cardinality(os.operator_times) > 0 THEN round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::numeric FROM unnest(os.operator_times) x), 2) END AS operator_median_minutes,
      CASE WHEN cardinality(os.operator_times) > 0 THEN round((SELECT min(x)::numeric FROM unnest(os.operator_times) x), 2) END AS operator_fastest_minutes,
      CASE WHEN cardinality(os.operator_times) > 0 THEN round((SELECT max(x)::numeric FROM unnest(os.operator_times) x), 2) END AS operator_slowest_minutes,
      coalesce(ps.peak_hour, os.peak_hour) AS peak_hour,
      greatest(coalesce(ps.active_days, 0), coalesce(os.active_days, 0)) AS active_days,
      coalesce(ps.matched_payment_orders, 0) AS matched_payment_orders,
      coalesce(os.matched_assignment_orders, 0) AS matched_assignment_orders,
      (SELECT action_log_count FROM action_quality) AS action_log_count
    FROM scoped_users su
    LEFT JOIN payer_stats ps ON ps.user_id = su.user_id
    LEFT JOIN operator_stats os ON os.user_id = su.user_id
  ), final_rows AS (
    SELECT *,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payment_count
        ELSE assignment_count
      END AS work_count,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payment_volume
        ELSE assignment_volume
      END AS total_volume,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN completed_locks
        ELSE completed_assignments
      END AS completed_count,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN stale_locks
        ELSE stale_assignments
      END AS stale_count,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN cancelled_after_action
        ELSE cancelled_assignments
      END AS cancelled_count,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payer_avg_minutes
        ELSE operator_avg_minutes
      END AS avg_minutes,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payer_median_minutes
        ELSE operator_median_minutes
      END AS median_minutes,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payer_fastest_minutes
        ELSE operator_fastest_minutes
      END AS fastest_minutes,
      CASE
        WHEN role_type IN ('payer','hybrid') THEN payer_slowest_minutes
        ELSE operator_slowest_minutes
      END AS slowest_minutes,
      CASE
        WHEN role_type IN ('payer','hybrid') AND payment_count > 0 THEN round((matched_payment_orders::numeric / payment_count::numeric) * 100, 2)
        WHEN role_type NOT IN ('payer','hybrid') AND assignment_count > 0 THEN round((matched_assignment_orders::numeric / assignment_count::numeric) * 100, 2)
        ELSE NULL
      END AS history_coverage,
      CASE
        WHEN role_type IN ('payer','hybrid') AND payment_count > 0 THEN round((completed_locks::numeric / greatest(lock_count, payment_count)::numeric) * 100, 2)
        WHEN role_type NOT IN ('payer','hybrid') AND assignment_count > 0 THEN round((completed_assignments::numeric / assignment_count::numeric) * 100, 2)
        ELSE NULL
      END AS completion_rate
    FROM scored
  ), scored_rows AS (
    SELECT *,
      CASE WHEN work_count <= 0 THEN NULL ELSE round(least(100, greatest(0,
        (coalesce(completion_rate, 0) * 0.35) +
        ((CASE WHEN avg_minutes IS NULL THEN 50 ELSE greatest(0, least(100, 100 - ((avg_minutes - 5) / 25.0 * 100))) END) * 0.25) +
        (least(work_count, 50) / 50.0 * 100 * 0.20) +
        (greatest(0, 100 - ((stale_count + cancelled_count)::numeric / greatest(work_count, 1)::numeric * 100)) * 0.15) +
        (least(active_days, greatest(1, ceil(extract(epoch from (p_to - p_from)) / 86400.0))) / greatest(1, ceil(extract(epoch from (p_to - p_from)) / 86400.0)) * 100 * 0.05)
      )), 2) END AS score,
      CASE WHEN work_count <= 0 THEN NULL ELSE round((
        coalesce(history_coverage, 0) * 0.55 +
        (CASE WHEN avg_minutes IS NOT NULL THEN 100 ELSE 35 END) * 0.25 +
        (CASE WHEN action_log_count > 0 THEN 100 ELSE 40 END) * 0.20
      ), 2) END AS data_confidence
    FROM final_rows
  ), filtered_rows AS (
    SELECT * FROM scored_rows
    WHERE p_scope = 'all'
       OR (p_scope = 'payers' AND role_type IN ('payer','hybrid'))
       OR (p_scope = 'operators' AND role_type IN ('operator','hybrid'))
       OR (p_scope = 'admins' AND role_type = 'admin')
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id,
      'display_name', display_name,
      'role_name', role_name,
      'role_type', role_type,
      'score', score,
      'data_confidence', data_confidence,
      'work_count', work_count,
      'completed_count', completed_count,
      'completion_rate', completion_rate,
      'total_volume', total_volume,
      'avg_minutes', avg_minutes,
      'median_minutes', median_minutes,
      'fastest_minutes', fastest_minutes,
      'slowest_minutes', slowest_minutes,
      'stale_count', stale_count,
      'cancelled_count', cancelled_count,
      'appeal_count', payer_appeals + operator_appeals,
      'payment_count', payment_count,
      'lock_count', lock_count,
      'completed_locks', completed_locks,
      'active_locks', active_locks,
      'stale_locks', stale_locks,
      'assignment_count', assignment_count,
      'completed_assignments', completed_assignments,
      'active_assignments', active_assignments,
      'stale_assignments', stale_assignments,
      'buy_count', buy_count,
      'sell_count', sell_count,
      'peak_hour', peak_hour,
      'history_coverage', history_coverage,
      'source_counts', jsonb_build_object(
        'matched_payment_orders', matched_payment_orders,
        'matched_assignment_orders', matched_assignment_orders,
        'action_logs', action_log_count,
        'timed_payer_events', payer_timed_count,
        'timed_operator_events', operator_timed_count
      ),
      'warnings', jsonb_strip_nulls(jsonb_build_object(
        'no_activity', CASE WHEN work_count = 0 THEN true END,
        'missing_action_logs', CASE WHEN action_log_count = 0 THEN true END,
        'low_history_coverage', CASE WHEN history_coverage IS NOT NULL AND history_coverage < 80 THEN true END,
        'stale_work', CASE WHEN stale_count > 0 THEN stale_count END
      ))
    ) ORDER BY score DESC NULLS LAST, work_count DESC, total_volume DESC), '[]'::jsonb)
  INTO v_metrics
  FROM filtered_rows;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(v_metrics) AS x(
      user_id uuid, score numeric, data_confidence numeric, work_count integer, completed_count integer,
      total_volume numeric, completion_rate numeric, median_minutes numeric, stale_count integer,
      role_type text, payment_count integer, assignment_count integer
    )
  )
  SELECT jsonb_build_object(
    'active_users', count(*) FILTER (WHERE work_count > 0),
    'total_users', count(*),
    'total_work', coalesce(sum(work_count), 0),
    'total_payments', coalesce(sum(payment_count), 0),
    'total_assignments', coalesce(sum(assignment_count), 0),
    'total_volume', coalesce(sum(total_volume), 0),
    'avg_score', round(avg(score) FILTER (WHERE score IS NOT NULL), 2),
    'avg_confidence', round(avg(data_confidence) FILTER (WHERE data_confidence IS NOT NULL), 2),
    'completion_rate', round((coalesce(sum(completed_count), 0)::numeric / nullif(coalesce(sum(work_count), 0), 0)) * 100, 2),
    'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY median_minutes)::numeric, 2),
    'stale_count', coalesce(sum(stale_count), 0),
    'no_activity_users', count(*) FILTER (WHERE work_count = 0)
  ) INTO v_summary
  FROM rows;

  WITH q AS (
    SELECT
      (SELECT count(*) FROM public.terminal_order_assignments WHERE created_at >= p_from AND created_at <= p_to) AS assignment_rows,
      (SELECT count(*) FROM public.terminal_payer_order_log WHERE created_at >= p_from AND created_at <= p_to) AS payer_log_rows,
      (SELECT count(*) FROM public.terminal_payer_order_locks WHERE locked_at >= p_from AND locked_at <= p_to) AS lock_rows,
      (SELECT count(*) FROM public.system_action_logs WHERE module='terminal' AND recorded_at >= p_from AND recorded_at <= p_to) AS action_log_rows,
      (SELECT max(snapshot_date) FROM public.terminal_mpi_snapshots) AS latest_snapshot_date
  )
  SELECT jsonb_build_object(
    'assignment_rows', assignment_rows,
    'payer_log_rows', payer_log_rows,
    'lock_rows', lock_rows,
    'action_log_rows', action_log_rows,
    'latest_snapshot_date', latest_snapshot_date,
    'warnings', jsonb_strip_nulls(jsonb_build_object(
      'assignments_sparse', CASE WHEN assignment_rows < payer_log_rows THEN 'Operator assignments are sparse compared with payer activity.' END,
      'terminal_action_logs_missing', CASE WHEN action_log_rows = 0 THEN 'Terminal action logs are not currently populated, so chat/release/admin action analytics are not scored.' END,
      'snapshot_stale', CASE WHEN latest_snapshot_date IS NULL OR latest_snapshot_date < (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 THEN 'MPI snapshot table is stale or empty.' END
    ))
  ) INTO v_quality
  FROM q;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'scope', p_scope),
    'summary', coalesce(v_summary, '{}'::jsonb),
    'metrics', coalesce(v_metrics, '[]'::jsonb),
    'data_quality', coalesce(v_quality, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_terminal_user_mpi_detail_v2(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_requesting_user_id uuid DEFAULT NULL,
  p_can_view_all boolean DEFAULT false,
  p_visible_user_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overview jsonb;
  v_metric jsonb;
  v_recent jsonb;
  v_hourly jsonb;
BEGIN
  IF NOT (p_can_view_all OR p_user_id = p_requesting_user_id OR (p_visible_user_ids IS NOT NULL AND p_user_id = ANY(p_visible_user_ids))) THEN
    RETURN jsonb_build_object('error', 'not_allowed');
  END IF;

  v_overview := public.get_terminal_mpi_v2(p_from, p_to, 'all', p_requesting_user_id, p_can_view_all, p_visible_user_ids);
  SELECT value INTO v_metric
  FROM jsonb_array_elements(v_overview->'metrics') value
  WHERE (value->>'user_id')::uuid = p_user_id
  LIMIT 1;

  WITH payer_orders AS (
    SELECT
      'payer'::text AS source_type,
      pe.order_number,
      pe.created_at AS event_at,
      'Marked Paid'::text AS event_label,
      boh.order_status,
      boh.trade_type,
      nullif(boh.total_price, '')::numeric AS total_price,
      boh.asset,
      boh.counter_part_nick_name
    FROM public.terminal_payer_order_log pe
    LEFT JOIN public.binance_order_history boh ON boh.order_number = pe.order_number
    WHERE pe.payer_id = p_user_id
      AND pe.action = 'marked_paid'
      AND pe.created_at >= p_from AND pe.created_at <= p_to
  ), operator_orders AS (
    SELECT
      'operator'::text AS source_type,
      toa.order_number,
      toa.created_at AS event_at,
      CASE WHEN toa.is_active THEN 'Assigned Active' ELSE 'Assignment Closed' END AS event_label,
      boh.order_status,
      coalesce(boh.trade_type, toa.trade_type) AS trade_type,
      coalesce(nullif(boh.total_price, '')::numeric, toa.total_price) AS total_price,
      coalesce(boh.asset, toa.asset) AS asset,
      boh.counter_part_nick_name
    FROM public.terminal_order_assignments toa
    LEFT JOIN public.binance_order_history boh ON boh.order_number = toa.order_number
    WHERE toa.assigned_to = p_user_id
      AND toa.created_at >= p_from AND toa.created_at <= p_to
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'source_type', source_type,
    'order_number', order_number,
    'event_at', event_at,
    'event_label', event_label,
    'order_status', order_status,
    'trade_type', trade_type,
    'total_price', total_price,
    'asset', asset,
    'counterparty', counter_part_nick_name
  ) ORDER BY event_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT * FROM payer_orders
    UNION ALL
    SELECT * FROM operator_orders
    ORDER BY event_at DESC
    LIMIT 50
  ) r;

  WITH events AS (
    SELECT created_at AS event_at FROM public.terminal_payer_order_log
    WHERE payer_id = p_user_id AND action = 'marked_paid' AND created_at >= p_from AND created_at <= p_to
    UNION ALL
    SELECT created_at FROM public.terminal_order_assignments
    WHERE assigned_to = p_user_id AND created_at >= p_from AND created_at <= p_to
  ), hours AS (
    SELECT generate_series(0, 23) AS hour
  )
  SELECT jsonb_agg(jsonb_build_object('hour', h.hour, 'count', coalesce(e.count, 0)) ORDER BY h.hour)
  INTO v_hourly
  FROM hours h
  LEFT JOIN (
    SELECT extract(hour from event_at AT TIME ZONE 'Asia/Kolkata')::integer AS hour, count(*) AS count
    FROM events
    GROUP BY 1
  ) e ON e.hour = h.hour;

  RETURN jsonb_build_object(
    'metric', coalesce(v_metric, '{}'::jsonb),
    'recent_orders', coalesce(v_recent, '[]'::jsonb),
    'hourly', coalesce(v_hourly, '[]'::jsonb),
    'data_quality', v_overview->'data_quality'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_terminal_mpi_snapshots_v2(p_date date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_payload jsonb;
  v_metric jsonb;
  v_count integer := 0;
BEGIN
  v_from := (p_date::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 millisecond';
  v_payload := public.get_terminal_mpi_v2(v_from, v_to, 'all', NULL, true, NULL);

  FOR v_metric IN SELECT value FROM jsonb_array_elements(v_payload->'metrics') value LOOP
    INSERT INTO public.terminal_mpi_snapshots (
      user_id, snapshot_date, role_type, orders_handled, orders_completed, orders_cancelled,
      total_volume, avg_completion_time_minutes, buy_count, sell_count, idle_time_minutes,
      completion_rate, avg_response_time_minutes, avg_order_size, mpi_score,
      measurable_work_count, payment_count, lock_count, stale_lock_count, stale_assignment_count,
      cancelled_after_action_count, median_handle_time_minutes, fastest_handle_time_minutes,
      slowest_handle_time_minutes, data_confidence, source_counts, data_quality
    ) VALUES (
      (v_metric->>'user_id')::uuid,
      p_date,
      v_metric->>'role_type',
      coalesce((v_metric->>'work_count')::integer, 0),
      coalesce((v_metric->>'completed_count')::integer, 0),
      coalesce((v_metric->>'cancelled_count')::integer, 0),
      coalesce((v_metric->>'total_volume')::numeric, 0),
      nullif(v_metric->>'avg_minutes', '')::numeric,
      coalesce((v_metric->>'buy_count')::integer, 0),
      coalesce((v_metric->>'sell_count')::integer, 0),
      0,
      nullif(v_metric->>'completion_rate', '')::numeric,
      nullif(v_metric->>'avg_minutes', '')::numeric,
      CASE WHEN coalesce((v_metric->>'work_count')::integer, 0) > 0 THEN coalesce((v_metric->>'total_volume')::numeric, 0) / greatest((v_metric->>'work_count')::numeric, 1) ELSE NULL END,
      nullif(v_metric->>'score', '')::numeric,
      coalesce((v_metric->>'work_count')::integer, 0),
      coalesce((v_metric->>'payment_count')::integer, 0),
      coalesce((v_metric->>'lock_count')::integer, 0),
      coalesce((v_metric->>'stale_locks')::integer, 0),
      coalesce((v_metric->>'stale_assignments')::integer, 0),
      coalesce((v_metric->>'cancelled_count')::integer, 0),
      nullif(v_metric->>'median_minutes', '')::numeric,
      nullif(v_metric->>'fastest_minutes', '')::numeric,
      nullif(v_metric->>'slowest_minutes', '')::numeric,
      nullif(v_metric->>'data_confidence', '')::numeric,
      coalesce(v_metric->'source_counts', '{}'::jsonb),
      jsonb_build_object('warnings', coalesce(v_metric->'warnings', '{}'::jsonb), 'global', coalesce(v_payload->'data_quality', '{}'::jsonb))
    )
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      role_type = EXCLUDED.role_type,
      orders_handled = EXCLUDED.orders_handled,
      orders_completed = EXCLUDED.orders_completed,
      orders_cancelled = EXCLUDED.orders_cancelled,
      total_volume = EXCLUDED.total_volume,
      avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
      buy_count = EXCLUDED.buy_count,
      sell_count = EXCLUDED.sell_count,
      completion_rate = EXCLUDED.completion_rate,
      avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
      avg_order_size = EXCLUDED.avg_order_size,
      mpi_score = EXCLUDED.mpi_score,
      measurable_work_count = EXCLUDED.measurable_work_count,
      payment_count = EXCLUDED.payment_count,
      lock_count = EXCLUDED.lock_count,
      stale_lock_count = EXCLUDED.stale_lock_count,
      stale_assignment_count = EXCLUDED.stale_assignment_count,
      cancelled_after_action_count = EXCLUDED.cancelled_after_action_count,
      median_handle_time_minutes = EXCLUDED.median_handle_time_minutes,
      fastest_handle_time_minutes = EXCLUDED.fastest_handle_time_minutes,
      slowest_handle_time_minutes = EXCLUDED.slowest_handle_time_minutes,
      data_confidence = EXCLUDED.data_confidence,
      source_counts = EXCLUDED.source_counts,
      data_quality = EXCLUDED.data_quality;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_terminal_mpi_snapshots(p_date date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_terminal_mpi_snapshots_v2(p_date);
END;
$$;

UPDATE public.terminal_mpi_snapshots
SET mpi_score = NULL,
    data_confidence = NULL,
    measurable_work_count = 0,
    data_quality = jsonb_build_object('warning', 'Legacy no-activity snapshot score cleared by MPI v2')
WHERE coalesce(orders_handled, 0) = 0
  AND coalesce(payment_count, 0) = 0
  AND coalesce(lock_count, 0) = 0;