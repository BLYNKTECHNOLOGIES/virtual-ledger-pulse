
CREATE OR REPLACE FUNCTION public.get_client_usernos(p_client_id uuid)
RETURNS TABLE(cp_userno text, nicknames text[], order_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coi.cp_userno,
         array_agg(DISTINCT coi.nickname) AS nicknames,
         count(*) AS order_count
  FROM client_binance_nicknames cbn
  JOIN cp_order_identity coi ON lower(coi.nickname) = lower(cbn.nickname)
  WHERE cbn.client_id = p_client_id
    AND cbn.is_active = true
    AND coi.cp_userno IS NOT NULL
  GROUP BY coi.cp_userno
  ORDER BY count(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.resolve_client_by_userno(p_order_number text)
RETURNS TABLE(cp_userno text, client_id uuid, client_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT coi.cp_userno
    FROM cp_order_identity coi
    WHERE coi.order_number = p_order_number
      AND coi.cp_userno IS NOT NULL
    LIMIT 1
  )
  SELECT u.cp_userno, c.id, c.name
  FROM u
  JOIN cp_order_identity coi2 ON coi2.cp_userno = u.cp_userno
  JOIN client_binance_nicknames cbn ON lower(cbn.nickname) = lower(coi2.nickname) AND cbn.is_active = true
  JOIN clients c ON c.id = cbn.client_id AND c.is_deleted = false
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_usernos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_client_by_userno(text) TO authenticated, service_role;
