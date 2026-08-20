
-- 1. Attach audit triggers to compliance tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_cases','account_investigations','compliance_documents','bank_communications','compliance_case_updates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_compliance_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_compliance_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compliance_audit_trigger()', t);
  END LOOP;
END $$;

-- 2. Recent activity feed
CREATE OR REPLACE FUNCTION public.compliance_recent_activity(p_days integer DEFAULT 7, p_limit integer DEFAULT 300)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH since AS (SELECT now() - make_interval(days => greatest(coalesce(p_days,7),1)) AS ts),
audit AS (
  SELECT l.changed_at AS at,
         l.table_name,
         l.record_id,
         l.action,
         l.changed_fields,
         l.changed_by,
         COALESCE(l.after_data, l.before_data) AS payload
  FROM public.compliance_audit_log l, since
  WHERE l.changed_at >= since.ts
),
events AS (
  SELECT a.at,
         a.table_name AS source,
         a.action,
         a.record_id,
         a.changed_by,
         CASE a.table_name
           WHEN 'bank_cases' THEN COALESCE(a.payload->>'case_number','Case') || ' · ' || COALESCE(a.payload->>'title','Untitled')
           WHEN 'account_investigations' THEN 'Investigation · ' || COALESCE(a.payload->>'investigation_type','general')
           WHEN 'compliance_documents' THEN 'Document · ' || COALESCE(a.payload->>'name','Untitled')
           WHEN 'bank_communications' THEN 'Bank communication · ' || COALESCE(a.payload->>'bank_name','Bank')
           WHEN 'compliance_case_updates' THEN 'Case update'
           ELSE a.table_name
         END AS title,
         CASE a.table_name
           WHEN 'bank_cases' THEN NULLIF(concat_ws(' · ', a.payload->>'case_type', a.payload->>'status', a.payload->>'priority'),'')
           WHEN 'account_investigations' THEN NULLIF(concat_ws(' · ', a.payload->>'status', a.payload->>'priority'),'')
           WHEN 'compliance_documents' THEN NULLIF(concat_ws(' · ', a.payload->>'category', a.payload->>'status'),'')
           WHEN 'bank_communications' THEN NULLIF(concat_ws(' · ', a.payload->>'mode', a.payload->>'contact_person'),'')
           WHEN 'compliance_case_updates' THEN left(COALESCE(a.payload->>'update_text',''), 180)
           ELSE NULL
         END AS subtitle,
         COALESCE(
           (SELECT array_agg(f ORDER BY f)
              FROM unnest(COALESCE(a.changed_fields,'{}'::text[])) f
             WHERE f NOT IN ('updated_at','last_activity_at','created_at')),
           '{}'::text[]
         ) AS fields
  FROM audit a
),
filtered AS (
  SELECT * FROM events
  WHERE action <> 'UPDATE' OR array_length(fields,1) > 0
),
enriched AS (
  SELECT f.*,
         COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)),''), u.username, u.email, 'System') AS actor
  FROM filtered f
  LEFT JOIN public.users u ON u.id = f.changed_by
  ORDER BY f.at DESC
  LIMIT greatest(coalesce(p_limit,300),1)
)
SELECT jsonb_build_object(
  'days', greatest(coalesce(p_days,7),1),
  'total', (SELECT count(*) FROM enriched),
  'events', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'at', at, 'source', source, 'action', action, 'record_id', record_id,
      'title', title, 'subtitle', subtitle, 'fields', to_jsonb(fields), 'actor', actor
    ) ORDER BY at DESC) FROM enriched
  ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.compliance_recent_activity(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_recent_activity(integer, integer) TO authenticated;
