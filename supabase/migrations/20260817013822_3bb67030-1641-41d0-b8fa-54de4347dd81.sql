CREATE OR REPLACE FUNCTION public.compliance_command_centre()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE res jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(),'compliance_view') THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT jsonb_build_object(
    'open_cases', (SELECT count(*) FROM public.bank_cases WHERE status NOT IN ('RESOLVED','CLOSED')),
    'amount_at_stake', (SELECT COALESCE(sum(amount_involved),0) FROM public.bank_cases WHERE status NOT IN ('RESOLVED','CLOSED')),
    'cases_by_type', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT case_type, count(*) AS count FROM public.bank_cases
         WHERE status NOT IN ('RESOLVED','CLOSED') GROUP BY case_type ORDER BY 2 DESC) x),
    'cases_by_age', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT bucket, count(*) AS count FROM (
          SELECT CASE
            WHEN now() - created_at < interval '7 days' THEN '0-7d'
            WHEN now() - created_at < interval '30 days' THEN '8-30d'
            WHEN now() - created_at < interval '90 days' THEN '31-90d'
            ELSE '90d+' END AS bucket
          FROM public.bank_cases WHERE status NOT IN ('RESOLVED','CLOSED')) b
        GROUP BY bucket ORDER BY bucket) x),
    'breached_sla', (SELECT count(*) FROM public.bank_cases
        WHERE status NOT IN ('RESOLVED','CLOSED')
          AND now() > created_at + (COALESCE(sla_days,15) || ' days')::interval),
    'lien_total', (
      SELECT COALESCE((SELECT sum(amount) FROM public.lien_cases WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')),0)
           + COALESCE((SELECT sum(amount_involved) FROM public.bank_cases
                        WHERE status NOT IN ('RESOLVED','CLOSED') AND upper(case_type::text) LIKE '%LIEN%'),0)),
    'lien_accounts', (
      SELECT count(*) FROM (
        SELECT bank_account_id FROM public.lien_cases WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')
        UNION
        SELECT bank_account_id FROM public.bank_cases
         WHERE status NOT IN ('RESOLVED','CLOSED') AND upper(case_type::text) LIKE '%LIEN%'
      ) a WHERE bank_account_id IS NOT NULL),
    'frozen_accounts', (SELECT count(*) FROM public.bank_account_compliance_v WHERE has_active_lien OR open_cases > 0),
    'avg_days_to_resolve_by_bank', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT COALESCE(ba.bank_name,'Unassigned') AS bank_name,
               round(avg(EXTRACT(epoch FROM (bc.resolved_at - bc.created_at))/86400)::numeric,1) AS avg_days,
               count(*) AS resolved_count
          FROM public.bank_cases bc LEFT JOIN public.bank_accounts ba ON ba.id = bc.bank_account_id
         WHERE bc.resolved_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC NULLS LAST) x),
    'hearings_30d', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT id, title, case_number, court_name, next_hearing_date FROM public.legal_actions
         WHERE next_hearing_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
         ORDER BY next_hearing_date) x),
    'documents_expiring', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT id, name, category, expiry_date FROM public.compliance_documents
         WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + 60
         ORDER BY expiry_date) x),
    'approvals_pending', (SELECT count(*) FROM public.investigation_approvals WHERE approval_status = 'PENDING'),
    'approvals_pending_48h', (SELECT count(*) FROM public.investigation_approvals
        WHERE approval_status = 'PENDING' AND submitted_at < now() - interval '48 hours'),
    'regulatory_open', (SELECT count(*) FROM public.compliance_regulatory_cases WHERE status NOT IN ('CLOSED','RESPONDED')),
    'regulatory_due_7d', (SELECT count(*) FROM public.compliance_regulatory_cases
        WHERE status NOT IN ('CLOSED','RESPONDED') AND deadline_date IS NOT NULL AND deadline_date <= CURRENT_DATE + 7),
    'str_pending', (SELECT count(*) FROM public.compliance_str_register WHERE decision = 'PENDING'),
    'obligations_due_30d', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT o.id, o.obligation_type, o.period_label, o.due_date, o.status, s.firm_name
          FROM public.compliance_statutory_obligations o
          LEFT JOIN public.subsidiaries s ON s.id = o.subsidiary_id
         WHERE o.status <> 'FILED' AND o.due_date <= CURRENT_DATE + 30
         ORDER BY o.due_date) x),
    'idle_cases', (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT id, case_number, title, status, COALESCE(last_activity_at, created_at) AS last_activity_at
          FROM public.bank_cases
         WHERE status NOT IN ('RESOLVED','CLOSED')
           AND COALESCE(last_activity_at, created_at) < now() - interval '7 days'
         ORDER BY 5) x)
  ) INTO res;
  RETURN res;
END; $function$;