
DROP TABLE IF EXISTS public.client_nickname_merge_audit_report;
CREATE TABLE public.client_nickname_merge_audit_report AS
WITH active_nicks AS (
  SELECT n.client_id, n.nickname, n.source FROM client_binance_nicknames n WHERE n.is_active = true
),
nick_orders AS (
  SELECT
    an.client_id, an.nickname, an.source,
    mode() WITHIN GROUP (ORDER BY c.cp_userno) FILTER (WHERE c.cp_userno IS NOT NULL) AS resolved_userno,
    count(c.order_number) AS order_count,
    count(*) FILTER (WHERE c.order_status IN ('COMPLETED','4')) AS completed_count,
    coalesce(sum(c.total_price),0) AS turnover,
    string_agg(DISTINCT c.order_number, ',') AS order_numbers,
    to_timestamp(min(c.create_time)/1000.0) AS first_order,
    to_timestamp(max(c.create_time)/1000.0) AS last_order,
    string_agg(DISTINCT c.verified_name, ' | ') FILTER (WHERE c.verified_name IS NOT NULL) AS verified_name,
    count(DISTINCT c.cp_userno) FILTER (WHERE c.cp_userno IS NOT NULL) AS distinct_usernos_on_nick
  FROM active_nicks an
  LEFT JOIN cp_order_identity c ON c.nickname = an.nickname
  GROUP BY an.client_id, an.nickname, an.source
),
enriched AS (
  SELECT no.*, cl.client_id AS client_code, cl.name AS client_name
  FROM nick_orders no JOIN clients cl ON cl.id = no.client_id
),
client_userno AS (
  SELECT client_id, client_name, resolved_userno,
         sum(order_count) AS un_orders, min(first_order) AS un_first,
         bool_or(lower(coalesce(verified_name,''))=lower(client_name) OR lower(nickname)=lower(client_name)) AS name_match
  FROM enriched WHERE resolved_userno IS NOT NULL
  GROUP BY client_id, client_name, resolved_userno
),
ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY client_id ORDER BY name_match DESC, un_orders DESC, un_first ASC NULLS LAST) AS rnk,
    count(*) OVER (PARTITION BY client_id) AS distinct_usernos
  FROM client_userno
),
anchors AS (SELECT client_id, resolved_userno AS anchor_userno, distinct_usernos FROM ranked WHERE rnk = 1)
SELECT
  e.client_id AS client_uuid, e.client_code, e.client_name, e.nickname, e.source,
  e.resolved_userno, e.distinct_usernos_on_nick, e.verified_name,
  e.order_count, e.completed_count, e.turnover, e.order_numbers, e.first_order, e.last_order,
  CASE WHEN e.resolved_userno IS NULL THEN 'UNRESOLVED'
       WHEN e.resolved_userno = a.anchor_userno THEN 'ANCHOR'
       ELSE 'SPLIT' END AS proposed_action,
  a.anchor_userno, coalesce(a.distinct_usernos,0) AS distinct_usernos_on_client
FROM enriched e LEFT JOIN anchors a ON a.client_id = e.client_id;

GRANT SELECT ON public.client_nickname_merge_audit_report TO authenticated, service_role;
ALTER TABLE public.client_nickname_merge_audit_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read merge audit" ON public.client_nickname_merge_audit_report FOR SELECT TO authenticated USING (true);
