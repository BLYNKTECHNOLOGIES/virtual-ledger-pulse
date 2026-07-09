
CREATE OR REPLACE FUNCTION public.audit_client_nickname_merges()
RETURNS TABLE (
  client_uuid uuid, client_code text, client_name text, nickname text, source text,
  resolved_userno text, verified_name text, order_count bigint, completed_count bigint,
  turnover numeric, order_numbers text, first_order timestamptz, last_order timestamptz,
  proposed_action text, anchor_userno text, distinct_usernos_on_client integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH our_ids AS (
  SELECT id FROM (
    SELECT order_detail_raw->>'merchantNo' AS id FROM binance_order_history WHERE order_detail_raw ? 'merchantNo'
    UNION ALL
    SELECT order_detail_raw->>'takerUserNo' FROM binance_order_history WHERE order_detail_raw ? 'takerUserNo'
  ) t
  WHERE id IS NOT NULL AND id <> ''
  GROUP BY id HAVING count(*) > 150
),
active_nicks AS (
  SELECT n.client_id, n.nickname, n.source FROM client_binance_nicknames n WHERE n.is_active = true
),
cp AS (
  SELECT
    o.counter_part_nick_name AS nickname, o.order_number, o.order_status,
    nullif(o.total_price,'')::numeric AS total_price,
    o.create_time, o.verified_name,
    CASE
      WHEN (o.order_detail_raw->>'merchantNo') IN (SELECT id FROM our_ids) THEN o.order_detail_raw->>'takerUserNo'
      WHEN (o.order_detail_raw->>'takerUserNo') IN (SELECT id FROM our_ids) THEN o.order_detail_raw->>'merchantNo'
      ELSE NULL
    END AS cp_userno
  FROM binance_order_history o
  WHERE o.counter_part_nick_name IS NOT NULL
    AND o.order_detail_raw IS NOT NULL AND o.order_detail_raw <> '{}'::jsonb
),
nick_orders AS (
  SELECT
    an.client_id, an.nickname, an.source,
    (SELECT mode() WITHIN GROUP (ORDER BY c.cp_userno)
       FROM cp c WHERE c.nickname = an.nickname AND c.cp_userno IS NOT NULL) AS resolved_userno,
    count(c.order_number) AS order_count,
    count(*) FILTER (WHERE c.order_status IN ('COMPLETED','4')) AS completed_count,
    coalesce(sum(c.total_price),0) AS turnover,
    string_agg(DISTINCT c.order_number, ',' ORDER BY c.order_number) AS order_numbers,
    to_timestamp(min(c.create_time)/1000.0) AS first_order,
    to_timestamp(max(c.create_time)/1000.0) AS last_order,
    (SELECT string_agg(DISTINCT c2.verified_name,' | ')
       FROM cp c2 WHERE c2.nickname = an.nickname AND c2.verified_name IS NOT NULL) AS verified_name
  FROM active_nicks an
  LEFT JOIN cp c ON c.nickname = an.nickname
  GROUP BY an.client_id, an.nickname, an.source
),
enriched AS (
  SELECT no.*, cl.client_id AS client_code, cl.name AS client_name
  FROM nick_orders no JOIN clients cl ON cl.id = no.client_id
),
client_userno AS (
  SELECT client_id, client_code, client_name, resolved_userno,
         sum(order_count) AS un_orders, min(first_order) AS un_first,
         bool_or(lower(coalesce(verified_name,'')) = lower(client_name) OR lower(nickname) = lower(client_name)) AS name_match
  FROM enriched WHERE resolved_userno IS NOT NULL
  GROUP BY client_id, client_code, client_name, resolved_userno
),
ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY client_id ORDER BY name_match DESC, un_orders DESC, un_first ASC NULLS LAST) AS rnk,
    count(*) OVER (PARTITION BY client_id) AS distinct_usernos
  FROM client_userno
),
anchors AS (SELECT client_id, resolved_userno AS anchor_userno, distinct_usernos FROM ranked WHERE rnk = 1)
SELECT
  e.client_id, e.client_code, e.client_name, e.nickname, e.source, e.resolved_userno, e.verified_name,
  e.order_count, e.completed_count, e.turnover, e.order_numbers, e.first_order, e.last_order,
  CASE WHEN e.resolved_userno IS NULL THEN 'UNRESOLVED'
       WHEN e.resolved_userno = a.anchor_userno THEN 'ANCHOR'
       ELSE 'SPLIT' END AS proposed_action,
  a.anchor_userno, coalesce(a.distinct_usernos,0) AS distinct_usernos_on_client
FROM enriched e LEFT JOIN anchors a ON a.client_id = e.client_id
ORDER BY coalesce(a.distinct_usernos,0) DESC, e.client_name, e.order_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.audit_client_nickname_merges() TO authenticated, service_role;
