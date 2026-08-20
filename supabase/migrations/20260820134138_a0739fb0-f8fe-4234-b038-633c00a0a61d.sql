
CREATE OR REPLACE FUNCTION public.compliance_recent_activity(p_days integer DEFAULT 7, p_limit integer DEFAULT 300)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH since AS (SELECT now() - make_interval(days => greatest(coalesce(p_days,7),1)) AS ts),
audit AS (
  SELECT l.changed_at AS at, l.table_name, l.record_id, l.action, l.changed_fields, l.changed_by,
         COALESCE(l.after_data, l.before_data) AS payload
  FROM public.compliance_audit_log l, since
  WHERE l.changed_at >= since.ts
),
audit_events AS (
  SELECT a.at, a.table_name AS source, a.action, a.record_id, a.changed_by,
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
         COALESCE((SELECT array_agg(f ORDER BY f) FROM unnest(COALESCE(a.changed_fields,'{}'::text[])) f
                    WHERE f NOT IN ('updated_at','last_activity_at','created_at')), '{}'::text[]) AS fields
  FROM audit a
),
seed AS (
  SELECT c.created_at AS at, 'bank_cases' AS source, 'INSERT' AS action, c.id AS record_id, c.created_by AS changed_by,
         COALESCE(c.case_number,'Case') || ' · ' || COALESCE(c.title,'Untitled') AS title,
         NULLIF(concat_ws(' · ', c.case_type, c.status, c.priority),'') AS subtitle, '{}'::text[] AS fields
  FROM public.bank_cases c, since WHERE c.created_at >= since.ts
  UNION ALL
  SELECT i.created_at, 'account_investigations', 'INSERT', i.id, NULL,
         'Investigation · ' || COALESCE(i.investigation_type,'general'),
         NULLIF(concat_ws(' · ', i.status, i.priority),''), '{}'::text[]
  FROM public.account_investigations i, since WHERE i.created_at >= since.ts
  UNION ALL
  SELECT d.created_at, 'compliance_documents', 'INSERT', d.id, d.uploaded_by,
         'Document · ' || COALESCE(d.name,'Untitled'),
         NULLIF(concat_ws(' · ', d.category, d.status),''), '{}'::text[]
  FROM public.compliance_documents d, since WHERE d.created_at >= since.ts
  UNION ALL
  SELECT bc.created_at, 'bank_communications', 'INSERT', bc.id, NULL,
         'Bank communication · ' || COALESCE(bc.bank_name,'Bank'),
         NULLIF(concat_ws(' · ', bc.mode, bc.contact_person),''), '{}'::text[]
  FROM public.bank_communications bc, since WHERE bc.created_at >= since.ts
  UNION ALL
  SELECT cu.created_at, 'compliance_case_updates', 'INSERT', cu.id, cu.created_by,
         'Case update', left(COALESCE(cu.update_text,''),180), '{}'::text[]
  FROM public.compliance_case_updates cu, since WHERE cu.created_at >= since.ts
),
seed_events AS (
  SELECT s.* FROM seed s
  WHERE NOT EXISTS (
    SELECT 1 FROM audit_events a
    WHERE a.record_id = s.record_id AND a.source = s.source AND a.action = 'INSERT'
  )
),
combined AS (
  SELECT * FROM audit_events
  UNION ALL
  SELECT at, source, action, record_id, changed_by, title, subtitle, fields FROM seed_events
),
filtered AS (
  SELECT * FROM combined WHERE action <> 'UPDATE' OR array_length(fields,1) > 0
),
enriched AS (
  SELECT f.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)),''), u.username, u.email, 'System') AS actor
  FROM filtered f
  LEFT JOIN public.users u ON u.id = f.changed_by
  ORDER BY f.at DESC
  LIMIT greatest(coalesce(p_limit,300),1)
)
SELECT jsonb_build_object(
  'days', greatest(coalesce(p_days,7),1),
  'total', (SELECT count(*) FROM enriched),
  'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'at', at, 'source', source, 'action', action, 'record_id', record_id,
      'title', title, 'subtitle', subtitle, 'fields', to_jsonb(fields), 'actor', actor
    ) ORDER BY at DESC) FROM enriched), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.compliance_recent_activity(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_recent_activity(integer, integer) TO authenticated, service_role;
