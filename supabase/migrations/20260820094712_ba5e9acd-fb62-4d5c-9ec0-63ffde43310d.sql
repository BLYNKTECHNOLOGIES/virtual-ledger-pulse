CREATE OR REPLACE FUNCTION public.admin_top_slow_queries(_limit int DEFAULT 20)
RETURNS TABLE(role_name text, calls bigint, total_ms numeric, mean_ms numeric, max_ms numeric, rows_returned bigint, query text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT s.userid::regrole::text,
         s.calls,
         s.total_exec_time::numeric(14,0),
         s.mean_exec_time::numeric(14,2),
         s.max_exec_time::numeric(14,2),
         s.rows,
         s.query
  FROM extensions.pg_stat_statements s
  ORDER BY s.total_exec_time DESC
  LIMIT COALESCE(_limit, 20)
$$;

REVOKE ALL ON FUNCTION public.admin_top_slow_queries(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_slow_queries(int) TO service_role;