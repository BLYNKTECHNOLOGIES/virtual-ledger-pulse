
-- ============ Phase 2: timeline + reminders ============
CREATE TABLE IF NOT EXISTS public.compliance_case_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_case_id uuid NOT NULL REFERENCES public.bank_cases(id) ON DELETE CASCADE,
  update_text text NOT NULL,
  update_type text NOT NULL DEFAULT 'NOTE',
  attachment_urls text[] DEFAULT '{}',
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_case_updates TO authenticated;
GRANT ALL ON public.compliance_case_updates TO service_role;
ALTER TABLE public.compliance_case_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ccu_view" ON public.compliance_case_updates FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));
CREATE POLICY "ccu_manage" ON public.compliance_case_updates FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage'));

CREATE TABLE IF NOT EXISTS public.compliance_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_key text NOT NULL UNIQUE,
  entity_type text NOT NULL,
  entity_id uuid,
  reminder_type text NOT NULL,
  recipients text[] DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compliance_reminder_log TO authenticated;
GRANT ALL ON public.compliance_reminder_log TO service_role;
ALTER TABLE public.compliance_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crl_view" ON public.compliance_reminder_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));

-- ============ Phase 3: business linkage ============
ALTER TABLE public.bank_cases
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS order_references text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sla_days integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();

ALTER TABLE public.lien_cases
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS bank_case_id uuid REFERENCES public.bank_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS freeze_type text NOT NULL DEFAULT 'DEBIT_FREEZE',
  ADD COLUMN IF NOT EXISTS release_date date,
  ADD COLUMN IF NOT EXISTS order_references text[] DEFAULT '{}';

ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS subsidiary_id uuid REFERENCES public.subsidiaries(id) ON DELETE SET NULL;

-- keep last_activity_at fresh from timeline writes
CREATE OR REPLACE FUNCTION public.touch_bank_case_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bank_cases SET last_activity_at = now(), updated_at = now()
   WHERE id = NEW.bank_case_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_touch_bank_case_activity ON public.compliance_case_updates;
CREATE TRIGGER trg_touch_bank_case_activity AFTER INSERT ON public.compliance_case_updates
FOR EACH ROW EXECUTE FUNCTION public.touch_bank_case_activity();

-- exposure per bank account
CREATE OR REPLACE VIEW public.bank_account_compliance_v
WITH (security_invoker = true) AS
SELECT
  ba.id AS bank_account_id,
  ba.account_name,
  ba.bank_name,
  ba.account_number,
  ba.account_status,
  COALESCE(c.open_cases, 0) AS open_cases,
  COALESCE(l.active_liens, 0) AS active_liens,
  COALESCE(l.lien_amount, 0) AS lien_amount,
  COALESCE(c.amount_at_stake, 0) AS amount_at_stake,
  (COALESCE(l.active_liens,0) > 0) AS has_active_lien
FROM public.bank_accounts ba
LEFT JOIN (
  SELECT bank_account_id,
         count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED')) AS open_cases,
         COALESCE(sum(amount_involved) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED')),0) AS amount_at_stake
  FROM public.bank_cases GROUP BY bank_account_id
) c ON c.bank_account_id = ba.id
LEFT JOIN (
  SELECT bank_account_id,
         count(*) FILTER (WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')) AS active_liens,
         COALESCE(sum(amount) FILTER (WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')),0) AS lien_amount
  FROM public.lien_cases GROUP BY bank_account_id
) l ON l.bank_account_id = ba.id;
GRANT SELECT ON public.bank_account_compliance_v TO authenticated, service_role;

-- ============ Phase 4: India regulatory registers ============
CREATE TABLE IF NOT EXISTS public.compliance_regulatory_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text,
  acknowledgment_number text,
  portal text NOT NULL DEFAULT 'NCRP',
  complaint_date date,
  lea_name text,
  jurisdiction text,
  officer_name text,
  officer_contact text,
  subject text NOT NULL,
  details text,
  amount_involved numeric,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_case_id uuid REFERENCES public.bank_cases(id) ON DELETE SET NULL,
  client_id uuid,
  subsidiary_id uuid REFERENCES public.subsidiaries(id) ON DELETE SET NULL,
  deadline_date date,
  response_filed_date date,
  response_proof_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'OPEN',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_regulatory_cases TO authenticated;
GRANT ALL ON public.compliance_regulatory_cases TO service_role;
ALTER TABLE public.compliance_regulatory_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crc_view" ON public.compliance_regulatory_cases FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));
CREATE POLICY "crc_manage" ON public.compliance_regulatory_cases FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage'));

CREATE TABLE IF NOT EXISTS public.compliance_str_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text,
  trigger_source text NOT NULL DEFAULT 'MANUAL',
  client_id uuid,
  client_name text,
  counterparty_name text,
  amount numeric,
  observed_on date NOT NULL DEFAULT CURRENT_DATE,
  red_flags text[] DEFAULT '{}',
  narrative text NOT NULL,
  maker_id uuid,
  maker_name text,
  maker_recommendation text NOT NULL DEFAULT 'FILE',
  checker_id uuid,
  checker_name text,
  decision text NOT NULL DEFAULT 'PENDING',
  decision_rationale text,
  decision_at timestamptz,
  filed_reference text,
  filed_on date,
  subsidiary_id uuid REFERENCES public.subsidiaries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_str_register TO authenticated;
GRANT ALL ON public.compliance_str_register TO service_role;
ALTER TABLE public.compliance_str_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "str_view" ON public.compliance_str_register FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));
CREATE POLICY "str_make" ON public.compliance_str_register FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage'));
CREATE POLICY "str_update" ON public.compliance_str_register FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_manage') OR public.has_permission(auth.uid(),'compliance_approve'))
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage') OR public.has_permission(auth.uid(),'compliance_approve'));

CREATE TABLE IF NOT EXISTS public.compliance_statutory_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid REFERENCES public.subsidiaries(id) ON DELETE CASCADE,
  obligation_type text NOT NULL,
  period_label text,
  due_date date NOT NULL,
  owner_user_id uuid,
  owner_name text,
  status text NOT NULL DEFAULT 'PENDING',
  filed_on date,
  filed_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_statutory_obligations TO authenticated;
GRANT ALL ON public.compliance_statutory_obligations TO service_role;
ALTER TABLE public.compliance_statutory_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cso_view" ON public.compliance_statutory_obligations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));
CREATE POLICY "cso_manage" ON public.compliance_statutory_obligations FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage'));

-- ============ Phase 5: config, audit, credential access ============
CREATE TABLE IF NOT EXISTS public.compliance_config_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_group text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_group, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_config_options TO authenticated;
GRANT ALL ON public.compliance_config_options TO service_role;
ALTER TABLE public.compliance_config_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cco_view" ON public.compliance_config_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "cco_manage" ON public.compliance_config_options FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_manage'))
  WITH CHECK (public.has_permission(auth.uid(),'compliance_manage'));

CREATE TABLE IF NOT EXISTS public.compliance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  before_data jsonb,
  after_data jsonb,
  changed_fields text[]
);
GRANT SELECT ON public.compliance_audit_log TO authenticated;
GRANT ALL ON public.compliance_audit_log TO service_role;
ALTER TABLE public.compliance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cal_view" ON public.compliance_audit_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_view'));

CREATE OR REPLACE FUNCTION public.compliance_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b jsonb; a jsonb; ch text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    a := to_jsonb(NEW); b := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    a := to_jsonb(NEW); b := to_jsonb(OLD);
    SELECT array_agg(key) INTO ch FROM jsonb_each(a) e(key, val)
      WHERE b->key IS DISTINCT FROM val;
    IF ch IS NULL OR array_length(ch,1) IS NULL THEN RETURN NEW; END IF;
  ELSE
    a := NULL; b := to_jsonb(OLD);
  END IF;
  INSERT INTO public.compliance_audit_log(table_name, record_id, action, changed_by, before_data, after_data, changed_fields)
  VALUES (TG_TABLE_NAME,
          COALESCE((a->>'id')::uuid, (b->>'id')::uuid),
          TG_OP, auth.uid(), b, a, ch);
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_cases','account_investigations','investigation_approvals','lien_cases',
                           'legal_actions','compliance_documents','subsidiaries',
                           'compliance_regulatory_cases','compliance_str_register','compliance_statutory_obligations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_compliance_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_compliance_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.compliance_audit_trigger()', t);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.banking_credential_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid,
  bank_account_id uuid,
  accessed_by uuid,
  accessed_by_name text,
  field_accessed text,
  action text NOT NULL DEFAULT 'REVEAL',
  accessed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.banking_credential_access_log TO authenticated;
GRANT ALL ON public.banking_credential_access_log TO service_role;
ALTER TABLE public.banking_credential_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bcal_view" ON public.banking_credential_access_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'compliance_manage'));
CREATE POLICY "bcal_insert" ON public.banking_credential_access_log FOR INSERT TO authenticated
  WITH CHECK (accessed_by = auth.uid());

-- seed configurable dropdowns
INSERT INTO public.compliance_config_options(option_group, value, label, sort_order) VALUES
 ('bank_case_type','ACCOUNT_NOT_WORKING','Account Not Working',10),
 ('bank_case_type','WRONG_PAYMENT_INITIATED','Wrong Payment Initiated',20),
 ('bank_case_type','PAYMENT_NOT_CREDITED','Payment Not Credited',30),
 ('bank_case_type','SETTLEMENT_NOT_RECEIVED','Settlement Not Received',40),
 ('bank_case_type','LIEN_RECEIVED','Lien Received',50),
 ('bank_case_type','BALANCE_DISCREPANCY','Balance Discrepancy',60),
 ('freeze_type','DEBIT_FREEZE','Debit Freeze (partial)',10),
 ('freeze_type','FULL_FREEZE','Full Freeze',20),
 ('freeze_type','AMOUNT_LIEN','Amount Lien Only',30),
 ('regulatory_portal','NCRP','NCRP (cybercrime.gov.in)',10),
 ('regulatory_portal','CYBER_CELL','State Cyber Cell',20),
 ('regulatory_portal','FIU_IND','FIU-IND',30),
 ('regulatory_portal','COURT','Court / Judicial',40),
 ('regulatory_portal','OTHER','Other',50),
 ('obligation_type','GST_GSTR1','GST — GSTR-1',10),
 ('obligation_type','GST_GSTR3B','GST — GSTR-3B',20),
 ('obligation_type','TDS_RETURN','TDS Return',30),
 ('obligation_type','ROC_FILING','ROC Filing',40),
 ('obligation_type','ITR','Income Tax Return',50),
 ('obligation_type','PF_ESIC','PF / ESIC Return',60),
 ('communication_mode','EMAIL','Email',10),
 ('communication_mode','CALL','Call',20),
 ('communication_mode','LETTER','Letter',30),
 ('communication_mode','MEETING','Meeting',40)
ON CONFLICT (option_group, value) DO NOTHING;

-- ============ Phase 2: document status recompute + command centre ============
CREATE OR REPLACE FUNCTION public.compliance_recompute_document_status()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE public.compliance_documents d
       SET status = CASE
             WHEN d.expiry_date IS NULL THEN 'ACTIVE'
             WHEN d.expiry_date < CURRENT_DATE THEN 'EXPIRED'
             WHEN d.expiry_date <= CURRENT_DATE + 60 THEN 'EXPIRING_SOON'
             ELSE 'ACTIVE' END,
           updated_at = now()
     WHERE d.status IS DISTINCT FROM (CASE
             WHEN d.expiry_date IS NULL THEN 'ACTIVE'
             WHEN d.expiry_date < CURRENT_DATE THEN 'EXPIRED'
             WHEN d.expiry_date <= CURRENT_DATE + 60 THEN 'EXPIRING_SOON'
             ELSE 'ACTIVE' END)
    RETURNING 1)
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END; $$;
GRANT EXECUTE ON FUNCTION public.compliance_recompute_document_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compliance_command_centre()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'lien_total', (SELECT COALESCE(sum(amount),0) FROM public.lien_cases WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')),
    'lien_accounts', (SELECT count(DISTINCT bank_account_id) FROM public.lien_cases WHERE upper(status) NOT IN ('RELEASED','CLOSED','RESOLVED')),
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
END; $$;
GRANT EXECUTE ON FUNCTION public.compliance_command_centre() TO authenticated, service_role;

SELECT public.compliance_recompute_document_status();
