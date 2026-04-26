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
    SELECT u.id AS user_id,
      trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
      u.username,
      string_agg(DISTINCT r.name, '/' ORDER BY r.name) FILTER (WHERE lower(r.name) <> 'viewer') AS role_name,
      bool_or(lower(r.name) LIKE '%payer%') AS role_is_payer,
      bool_or(lower(r.name) LIKE '%operator%') AS role_is_operator,
      bool_or(lower(r.name) LIKE '%admin%' OR lower(r.name) LIKE '%super%' OR lower(r.name) LIKE '%coo%') AS role_is_admin
    FROM public.users u
    JOIN public.p2p_terminal_user_roles ur ON ur.user_id = u.id
    JOIN public.p2p_terminal_roles r ON r.id = ur.role_id
    WHERE p_can_view_all OR u.id = p_requesting_user_id OR (p_visible_user_ids IS NOT NULL AND u.id = ANY(p_visible_user_ids))
    GROUP BY u.id, u.first_name, u.last_name, u.username
  ), payer_events AS (
    SELECT payer_id AS user_id, order_number, min(created_at) AS paid_at
    FROM public.terminal_payer_order_log
    WHERE action = 'marked_paid' AND created_at >= p_from AND created_at <= p_to
    GROUP BY payer_id, order_number
  ), payer_stats AS (
    SELECT ru.user_id,
      count(DISTINCT pe.order_number)::int AS payment_count,
      count(DISTINCT l.order_number)::int AS lock_count,
      count(DISTINCT l.order_number) FILTER (WHERE l.status = 'completed')::int AS completed_locks,
      count(DISTINCT l.order_number) FILTER (WHERE l.status <> 'completed')::int AS active_locks,
      count(DISTINCT l.order_number) FILTER (WHERE l.status <> 'completed' AND p_to - l.locked_at > interval '30 minutes')::int AS stale_locks,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_number IS NOT NULL)::int AS matched_payment_orders,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_status IN ('CANCELLED','CANCELLED_BY_SYSTEM','EXPIRED','8','9'))::int AS cancelled_after_action,
      count(DISTINCT pe.order_number) FILTER (WHERE boh.order_status IN ('IN_APPEAL','APPEAL'))::int AS appeal_after_action,
      coalesce(sum(nullif(boh.total_price, '')::numeric) FILTER (WHERE pe.order_number IS NOT NULL AND boh.order_number IS NOT NULL), 0) AS payment_volume,
      count(DISTINCT (pe.paid_at AT TIME ZONE 'Asia/Kolkata')::date)::int AS active_days,
      mode() WITHIN GROUP (ORDER BY extract(hour from pe.paid_at AT TIME ZONE 'Asia/Kolkata')) AS peak_hour,
      array_remove(array_agg(EXTRACT(EPOCH FROM (coalesce(l.completed_at, pe.paid_at) - l.locked_at)) / 60.0) FILTER (
        WHERE l.locked_at IS NOT NULL AND coalesce(l.completed_at, pe.paid_at) IS NOT NULL AND coalesce(l.completed_at, pe.paid_at) > l.locked_at AND coalesce(l.completed_at, pe.paid_at) - l.locked_at < interval '1 day'
      ), NULL) AS payer_times
    FROM role_users ru
    LEFT JOIN payer_events pe ON pe.user_id = ru.user_id
    LEFT JOIN public.terminal_payer_order_locks l ON l.payer_user_id = ru.user_id AND (l.order_number = pe.order_number OR (pe.order_number IS NULL AND (l.locked_at >= p_from AND l.locked_at <= p_to OR l.status = 'active')))
    LEFT JOIN public.binance_order_history boh ON boh.order_number = pe.order_number
    GROUP BY ru.user_id
  ), operator_stats AS (
    SELECT ru.user_id,
      count(DISTINCT toa.order_number)::int AS assignment_count,
      count(DISTINCT toa.order_number) FILTER (WHERE boh.order_status = 'COMPLETED' OR (boh.order_status IS NULL AND toa.is_active = false AND toa.assignment_type <> 'cancelled'))::int AS completed_assignments,
      count(DISTINCT toa.order_number) FILTER (WHERE boh.order_status IN ('CANCELLED','CANCELLED_BY_SYSTEM','EXPIRED','8','9') OR toa.assignment_type = 'cancelled')::int AS cancelled_assignments,
      count(DISTINCT toa.order_number) FILTER (WHERE toa.is_active = true)::int AS active_assignments,
      count(DISTINCT toa.order_number) FILTER (WHERE toa.is_active = true AND p_to - toa.created_at > interval '30 minutes')::int AS stale_assignments,
      count(DISTINCT toa.order_number) FILTER (WHERE boh.order_status IN ('IN_APPEAL','APPEAL'))::int AS appeal_assignments,
      count(DISTINCT toa.order_number) FILTER (WHERE boh.order_status IS NOT NULL)::int AS matched_assignment_orders,
      count(DISTINCT toa.order_number) FILTER (WHERE coalesce(boh.trade_type, toa.trade_type) = 'BUY')::int AS buy_count,
      count(DISTINCT toa.order_number) FILTER (WHERE coalesce(boh.trade_type, toa.trade_type) = 'SELL')::int AS sell_count,
      coalesce(sum(coalesce(nullif(boh.total_price, '')::numeric, toa.total_price, 0)), 0) AS assignment_volume,
      count(DISTINCT (toa.created_at AT TIME ZONE 'Asia/Kolkata')::date)::int AS active_days,
      mode() WITHIN GROUP (ORDER BY extract(hour from toa.created_at AT TIME ZONE 'Asia/Kolkata')) AS peak_hour,
      array_remove(array_agg(EXTRACT(EPOCH FROM (toa.updated_at - toa.created_at)) / 60.0) FILTER (
        WHERE toa.is_active = false AND toa.updated_at IS NOT NULL AND toa.updated_at > toa.created_at AND toa.updated_at - toa.created_at < interval '1 day'
      ), NULL) AS operator_times
    FROM role_users ru
    LEFT JOIN public.terminal_order_assignments toa ON toa.assigned_to = ru.user_id AND (toa.created_at >= p_from AND toa.created_at <= p_to OR (toa.is_active = true AND toa.created_at < p_to))
    LEFT JOIN public.binance_order_history boh ON boh.order_number = toa.order_number
    GROUP BY ru.user_id
  ), action_quality AS (
    SELECT count(*)::int AS action_log_count FROM public.system_action_logs WHERE module = 'terminal' AND recorded_at >= p_from AND recorded_at <= p_to
  ), combined AS (
    SELECT ru.user_id,
      coalesce(nullif(ru.full_name, ''), ru.username, ru.user_id::text) AS display_name,
      coalesce(nullif(ru.role_name, ''), 'Terminal User') AS role_name,
      CASE
        WHEN coalesce(ps.payment_count,0) > 0 OR coalesce(ps.lock_count,0) > 0 THEN CASE WHEN coalesce(os.assignment_count,0) > 0 THEN 'hybrid' ELSE 'payer' END
        WHEN coalesce(os.assignment_count,0) > 0 THEN 'operator'
        WHEN ru.role_is_payer AND ru.role_is_operator THEN 'hybrid'
        WHEN ru.role_is_payer THEN 'payer'
        WHEN ru.role_is_operator THEN 'operator'
        WHEN ru.role_is_admin THEN 'admin'
        ELSE 'operator'
      END AS role_type,
      ps.*, os.*, aq.action_log_count
    FROM role_users ru
    LEFT JOIN payer_stats ps ON ps.user_id = ru.user_id
    LEFT JOIN operator_stats os ON os.user_id = ru.user_id
    CROSS JOIN action_quality aq
  ), measured AS (
    SELECT *,
      CASE WHEN role_type IN ('payer','hybrid') THEN coalesce(payment_count,0) ELSE coalesce(assignment_count,0) END AS work_count,
      CASE WHEN role_type IN ('payer','hybrid') THEN coalesce(payment_volume,0) ELSE coalesce(assignment_volume,0) END AS total_volume,
      CASE WHEN role_type IN ('payer','hybrid') THEN coalesce(completed_locks,0) ELSE coalesce(completed_assignments,0) END AS completed_count,
      CASE WHEN role_type IN ('payer','hybrid') THEN coalesce(stale_locks,0) ELSE coalesce(stale_assignments,0) END AS stale_count,
      CASE WHEN role_type IN ('payer','hybrid') THEN coalesce(cancelled_after_action,0) ELSE coalesce(cancelled_assignments,0) END AS cancelled_count,
      CASE WHEN role_type IN ('payer','hybrid') AND cardinality(payer_times) > 0 THEN round((SELECT avg(x)::numeric FROM unnest(payer_times) x),2)
           WHEN role_type NOT IN ('payer','hybrid') AND cardinality(operator_times) > 0 THEN round((SELECT avg(x)::numeric FROM unnest(operator_times) x),2) END AS avg_minutes,
      CASE WHEN role_type IN ('payer','hybrid') AND cardinality(payer_times) > 0 THEN round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::numeric FROM unnest(payer_times) x),2)
           WHEN role_type NOT IN ('payer','hybrid') AND cardinality(operator_times) > 0 THEN round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::numeric FROM unnest(operator_times) x),2) END AS median_minutes,
      CASE WHEN role_type IN ('payer','hybrid') AND cardinality(payer_times) > 0 THEN round((SELECT min(x)::numeric FROM unnest(payer_times) x),2)
           WHEN role_type NOT IN ('payer','hybrid') AND cardinality(operator_times) > 0 THEN round((SELECT min(x)::numeric FROM unnest(operator_times) x),2) END AS fastest_minutes,
      CASE WHEN role_type IN ('payer','hybrid') AND cardinality(payer_times) > 0 THEN round((SELECT max(x)::numeric FROM unnest(payer_times) x),2)
           WHEN role_type NOT IN ('payer','hybrid') AND cardinality(operator_times) > 0 THEN round((SELECT max(x)::numeric FROM unnest(operator_times) x),2) END AS slowest_minutes,
      CASE WHEN role_type IN ('payer','hybrid') AND coalesce(payment_count,0) > 0 THEN round((coalesce(matched_payment_orders,0)::numeric/payment_count::numeric)*100,2)
           WHEN role_type NOT IN ('payer','hybrid') AND coalesce(assignment_count,0) > 0 THEN round((coalesce(matched_assignment_orders,0)::numeric/assignment_count::numeric)*100,2) END AS history_coverage,
      CASE WHEN role_type IN ('payer','hybrid') AND greatest(coalesce(lock_count,0), coalesce(payment_count,0)) > 0 THEN round((coalesce(completed_locks,0)::numeric/greatest(lock_count,payment_count)::numeric)*100,2)
           WHEN role_type NOT IN ('payer','hybrid') AND coalesce(assignment_count,0) > 0 THEN round((coalesce(completed_assignments,0)::numeric/assignment_count::numeric)*100,2) END AS completion_rate
    FROM combined
  ), scored AS (
    SELECT *,
      CASE WHEN work_count <= 0 THEN NULL ELSE round(least(100, greatest(0,
        (coalesce(completion_rate,0)*0.35) +
        ((CASE WHEN avg_minutes IS NULL THEN 50 ELSE greatest(0,least(100,100-((avg_minutes-5)/25.0*100))) END)*0.25) +
        (least(work_count,50)/50.0*100*0.20) +
        (greatest(0,100-((stale_count+cancelled_count)::numeric/greatest(work_count,1)::numeric*100))*0.15) +
        (least(greatest(coalesce(active_days,0),coalesce(operator_stats.active_days,0)), greatest(1,ceil(extract(epoch from (p_to-p_from))/86400.0))) / greatest(1,ceil(extract(epoch from (p_to-p_from))/86400.0)) * 100 * 0.05)
      )),2) END AS score,
      CASE WHEN work_count <= 0 THEN NULL ELSE round((coalesce(history_coverage,0)*0.55 + (CASE WHEN avg_minutes IS NOT NULL THEN 100 ELSE 35 END)*0.25 + (CASE WHEN action_log_count > 0 THEN 100 ELSE 40 END)*0.20),2) END AS data_confidence
    FROM measured
  ), filtered AS (
    SELECT * FROM scored
    WHERE p_scope='all' OR (p_scope='payers' AND role_type IN ('payer','hybrid')) OR (p_scope='operators' AND role_type IN ('operator','hybrid')) OR (p_scope='admins' AND role_type='admin')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id, 'display_name', display_name, 'role_name', role_name, 'role_type', role_type,
    'score', score, 'data_confidence', data_confidence, 'work_count', work_count, 'completed_count', completed_count,
    'completion_rate', completion_rate, 'total_volume', total_volume, 'avg_minutes', avg_minutes, 'median_minutes', median_minutes,
    'fastest_minutes', fastest_minutes, 'slowest_minutes', slowest_minutes, 'stale_count', stale_count, 'cancelled_count', cancelled_count,
    'appeal_count', coalesce(appeal_after_action,0)+coalesce(appeal_assignments,0), 'payment_count', coalesce(payment_count,0),
    'lock_count', coalesce(lock_count,0), 'completed_locks', coalesce(completed_locks,0), 'active_locks', coalesce(active_locks,0),
    'stale_locks', coalesce(stale_locks,0), 'assignment_count', coalesce(assignment_count,0), 'completed_assignments', coalesce(completed_assignments,0),
    'active_assignments', coalesce(active_assignments,0), 'stale_assignments', coalesce(stale_assignments,0), 'buy_count', coalesce(buy_count,0),
    'sell_count', coalesce(sell_count,0), 'peak_hour', coalesce(peak_hour, operator_stats.peak_hour), 'history_coverage', history_coverage,
    'source_counts', jsonb_build_object('matched_payment_orders', coalesce(matched_payment_orders,0), 'matched_assignment_orders', coalesce(matched_assignment_orders,0), 'action_logs', action_log_count, 'timed_payer_events', coalesce(cardinality(payer_times),0), 'timed_operator_events', coalesce(cardinality(operator_times),0)),
    'warnings', jsonb_strip_nulls(jsonb_build_object('no_activity', CASE WHEN work_count=0 THEN true END, 'missing_action_logs', CASE WHEN action_log_count=0 THEN true END, 'low_history_coverage', CASE WHEN history_coverage IS NOT NULL AND history_coverage < 80 THEN true END, 'stale_work', CASE WHEN stale_count>0 THEN stale_count END))
  ) ORDER BY score DESC NULLS LAST, work_count DESC, total_volume DESC), '[]'::jsonb) INTO v_metrics
  FROM filtered;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(v_metrics) AS x(user_id uuid, score numeric, data_confidence numeric, work_count integer, completed_count integer, total_volume numeric, completion_rate numeric, median_minutes numeric, stale_count integer, role_type text, payment_count integer, assignment_count integer)
  ) SELECT jsonb_build_object('active_users', count(*) FILTER (WHERE work_count>0), 'total_users', count(*), 'total_work', coalesce(sum(work_count),0), 'total_payments', coalesce(sum(payment_count),0), 'total_assignments', coalesce(sum(assignment_count),0), 'total_volume', coalesce(sum(total_volume),0), 'avg_score', round(avg(score) FILTER (WHERE score IS NOT NULL),2), 'avg_confidence', round(avg(data_confidence) FILTER (WHERE data_confidence IS NOT NULL),2), 'completion_rate', round((coalesce(sum(completed_count),0)::numeric/nullif(coalesce(sum(work_count),0),0))*100,2), 'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY median_minutes)::numeric,2), 'stale_count', coalesce(sum(stale_count),0), 'no_activity_users', count(*) FILTER (WHERE work_count=0)) INTO v_summary FROM rows;

  WITH q AS (
    SELECT (SELECT count(*) FROM public.terminal_order_assignments WHERE created_at>=p_from AND created_at<=p_to) AS assignment_rows,
           (SELECT count(*) FROM public.terminal_payer_order_log WHERE created_at>=p_from AND created_at<=p_to) AS payer_log_rows,
           (SELECT count(*) FROM public.terminal_payer_order_locks WHERE locked_at>=p_from AND locked_at<=p_to) AS lock_rows,
           (SELECT count(*) FROM public.system_action_logs WHERE module='terminal' AND recorded_at>=p_from AND recorded_at<=p_to) AS action_log_rows,
           (SELECT max(snapshot_date) FROM public.terminal_mpi_snapshots) AS latest_snapshot_date
  ) SELECT jsonb_build_object('assignment_rows', assignment_rows, 'payer_log_rows', payer_log_rows, 'lock_rows', lock_rows, 'action_log_rows', action_log_rows, 'latest_snapshot_date', latest_snapshot_date, 'warnings', jsonb_strip_nulls(jsonb_build_object('assignments_sparse', CASE WHEN assignment_rows < payer_log_rows THEN 'Operator assignments are sparse compared with payer activity.' END, 'terminal_action_logs_missing', CASE WHEN action_log_rows=0 THEN 'Terminal action logs are not currently populated, so chat/release/admin action analytics are not scored.' END, 'snapshot_stale', CASE WHEN latest_snapshot_date IS NULL OR latest_snapshot_date < (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 THEN 'MPI snapshot table is stale or empty.' END))) INTO v_quality FROM q;

  RETURN jsonb_build_object('period', jsonb_build_object('from', p_from, 'to', p_to, 'scope', p_scope), 'summary', coalesce(v_summary,'{}'::jsonb), 'metrics', coalesce(v_metrics,'[]'::jsonb), 'data_quality', coalesce(v_quality,'{}'::jsonb));
END;
$$;