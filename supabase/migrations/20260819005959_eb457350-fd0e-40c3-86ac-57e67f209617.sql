
-- ============ Phase 1: HR Document Studio foundation ============

CREATE OR REPLACE FUNCTION public.hr_doc_can_view_sensitive(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.hr_is_hr_staff(_user_id)
     AND (public.has_permission(_user_id, 'payroll_view')
          OR public.has_permission(_user_id, 'super_admin_access')
          OR public.has_permission(_user_id, 'admin_access'));
$$;

CREATE OR REPLACE FUNCTION public.hr_doc_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------- field catalog ----------
CREATE TABLE public.hr_doc_field_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_group text NOT NULL,
  data_type text NOT NULL DEFAULT 'text',
  formatter text,
  resolver_id text,
  description text,
  is_sensitive boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT false,
  allows_instances boolean NOT NULL DEFAULT false,
  default_value text,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_field_catalog TO authenticated;
GRANT ALL ON public.hr_doc_field_catalog TO service_role;
ALTER TABLE public.hr_doc_field_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read field catalog" ON public.hr_doc_field_catalog
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage field catalog" ON public.hr_doc_field_catalog
  FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE TRIGGER trg_hr_doc_field_catalog_touch BEFORE UPDATE ON public.hr_doc_field_catalog
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_touch_updated_at();

-- ---------- signatories ----------
CREATE TABLE public.hr_doc_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  designation text,
  employee_id uuid,
  signature_path text,
  seal_path text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_signatories TO authenticated;
GRANT ALL ON public.hr_doc_signatories TO service_role;
ALTER TABLE public.hr_doc_signatories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read signatories" ON public.hr_doc_signatories
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage signatories" ON public.hr_doc_signatories
  FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE TRIGGER trg_hr_doc_signatories_touch BEFORE UPDATE ON public.hr_doc_signatories
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_touch_updated_at();

CREATE TABLE public.hr_doc_signatory_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signatory_id uuid NOT NULL REFERENCES public.hr_doc_signatories(id) ON DELETE CASCADE,
  user_id uuid,
  role_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_doc_sig_perm_target CHECK (user_id IS NOT NULL OR role_name IS NOT NULL)
);
CREATE UNIQUE INDEX hr_doc_sig_perm_user_uniq ON public.hr_doc_signatory_permissions(signatory_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX hr_doc_sig_perm_role_uniq ON public.hr_doc_signatory_permissions(signatory_id, role_name) WHERE role_name IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_signatory_permissions TO authenticated;
GRANT ALL ON public.hr_doc_signatory_permissions TO service_role;
ALTER TABLE public.hr_doc_signatory_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read signatory perms" ON public.hr_doc_signatory_permissions
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff manage signatory perms" ON public.hr_doc_signatory_permissions
  FOR ALL TO authenticated USING (public.hr_is_hr_staff(auth.uid())) WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- ---------- templates ----------
CREATE TABLE public.hr_doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  description text,
  lane text NOT NULL DEFAULT 'native',
  status text NOT NULL DEFAULT 'draft',
  contains_sensitive boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  reference_pattern text,
  current_version_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_doc_templates_lane_chk CHECK (lane IN ('native','docx')),
  CONSTRAINT hr_doc_templates_status_chk CHECK (status IN ('draft','active','archived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_templates TO authenticated;
GRANT ALL ON public.hr_doc_templates TO service_role;
ALTER TABLE public.hr_doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read templates" ON public.hr_doc_templates
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) AND (NOT contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid())));
CREATE POLICY "HR staff manage templates" ON public.hr_doc_templates
  FOR ALL TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) AND (NOT contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid())))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()) AND (NOT contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid())));
CREATE TRIGGER trg_hr_doc_templates_touch BEFORE UPDATE ON public.hr_doc_templates
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_touch_updated_at();

CREATE TABLE public.hr_doc_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.hr_doc_templates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  lane text NOT NULL DEFAULT 'native',
  content_html text,
  source_file_path text,
  source_file_name text,
  page_setup jsonb NOT NULL DEFAULT '{"size":"A4","marginMm":{"top":25,"right":20,"bottom":25,"left":20}}'::jsonb,
  placeholder_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  unparsed_tokens jsonb NOT NULL DEFAULT '[]'::jsonb,
  checksum text,
  change_note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_doc_template_versions TO authenticated;
GRANT ALL ON public.hr_doc_template_versions TO service_role;
ALTER TABLE public.hr_doc_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read template versions" ON public.hr_doc_template_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.hr_doc_templates t WHERE t.id = template_id
            AND public.hr_is_hr_staff(auth.uid())
            AND (NOT t.contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid()))));
CREATE POLICY "HR staff insert template versions" ON public.hr_doc_template_versions
  FOR INSERT TO authenticated WITH CHECK (public.hr_is_hr_staff(auth.uid()));

ALTER TABLE public.hr_doc_templates
  ADD CONSTRAINT hr_doc_templates_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.hr_doc_template_versions(id) ON DELETE SET NULL;

-- ---------- reference numbering ----------
CREATE TABLE public.hr_doc_reference_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  pattern text NOT NULL DEFAULT 'BLYNK/{TYPE}/{FY}/{SEQ:4}',
  last_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_doc_reference_sequences TO authenticated;
GRANT ALL ON public.hr_doc_reference_sequences TO service_role;
ALTER TABLE public.hr_doc_reference_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read ref sequences" ON public.hr_doc_reference_sequences
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.hr_doc_allocate_reference(_scope_key text, _pattern text DEFAULT NULL, _type_code text DEFAULT 'DOC')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next integer; v_pattern text; v_fy text; v_width integer; v_seq text; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  INSERT INTO public.hr_doc_reference_sequences(scope_key, pattern)
    VALUES (_scope_key, COALESCE(_pattern, 'BLYNK/{TYPE}/{FY}/{SEQ:4}'))
    ON CONFLICT (scope_key) DO NOTHING;
  UPDATE public.hr_doc_reference_sequences
     SET last_value = last_value + 1, updated_at = now()
   WHERE scope_key = _scope_key
   RETURNING last_value, pattern INTO v_next, v_pattern;
  v_pattern := COALESCE(_pattern, v_pattern);
  IF EXTRACT(MONTH FROM v_today) >= 4 THEN
    v_fy := to_char(v_today,'YYYY') || '-' || to_char((v_today + interval '1 year'),'YY');
  ELSE
    v_fy := to_char((v_today - interval '1 year'),'YYYY') || '-' || to_char(v_today,'YY');
  END IF;
  v_width := COALESCE(NULLIF((regexp_match(v_pattern, '\{SEQ:(\d+)\}'))[1],'')::int, 4);
  v_seq := lpad(v_next::text, v_width, '0');
  v_pattern := regexp_replace(v_pattern, '\{SEQ(:\d+)?\}', v_seq, 'g');
  v_pattern := replace(v_pattern, '{TYPE}', upper(_type_code));
  v_pattern := replace(v_pattern, '{FY}', v_fy);
  v_pattern := replace(v_pattern, '{YYYY}', to_char(v_today,'YYYY'));
  v_pattern := replace(v_pattern, '{MM}', to_char(v_today,'MM'));
  RETURN v_pattern;
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_doc_allocate_reference(text, text, text) TO authenticated;

-- ---------- issued documents ----------
CREATE TABLE public.hr_documents_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.hr_doc_templates(id) ON DELETE SET NULL,
  template_version_id uuid REFERENCES public.hr_doc_template_versions(id) ON DELETE SET NULL,
  template_name text,
  category text,
  employee_id uuid,
  employee_name text,
  reference_no text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  contains_sensitive boolean NOT NULL DEFAULT false,
  file_path text,
  file_mime text,
  values_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  signatory_ids uuid[] NOT NULL DEFAULT '{}',
  issued_by uuid,
  issued_by_name text,
  issued_at timestamptz,
  delivered_at timestamptz,
  delivered_to text,
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  supersedes_id uuid REFERENCES public.hr_documents_issued(id) ON DELETE SET NULL,
  superseded_by_id uuid REFERENCES public.hr_documents_issued(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_documents_issued_status_chk CHECK (status IN ('draft','pending_approval','issued','delivered','revoked','superseded'))
);
CREATE INDEX hr_documents_issued_employee_idx ON public.hr_documents_issued(employee_id);
CREATE INDEX hr_documents_issued_status_idx ON public.hr_documents_issued(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_documents_issued TO authenticated;
GRANT ALL ON public.hr_documents_issued TO service_role;
ALTER TABLE public.hr_documents_issued ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read issued docs" ON public.hr_documents_issued
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) AND (NOT contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid())));
CREATE POLICY "HR staff create issued docs" ON public.hr_documents_issued
  FOR INSERT TO authenticated WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff update issued docs" ON public.hr_documents_issued
  FOR UPDATE TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) AND (NOT contains_sensitive OR public.hr_doc_can_view_sensitive(auth.uid())))
  WITH CHECK (public.hr_is_hr_staff(auth.uid()));
CREATE TRIGGER trg_hr_documents_issued_touch BEFORE UPDATE ON public.hr_documents_issued
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_touch_updated_at();

-- freeze: once issued, content-defining fields are immutable
CREATE OR REPLACE FUNCTION public.hr_doc_freeze_issued()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('issued','delivered','revoked','superseded') THEN
    IF NEW.values_snapshot IS DISTINCT FROM OLD.values_snapshot
       OR NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
       OR NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN
      RAISE EXCEPTION 'Issued documents are frozen: reissue instead of editing';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_hr_documents_issued_freeze BEFORE UPDATE ON public.hr_documents_issued
  FOR EACH ROW EXECUTE FUNCTION public.hr_doc_freeze_issued();

-- ---------- audit log ----------
CREATE TABLE public.hr_doc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_id uuid,
  actor_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_doc_audit_entity_idx ON public.hr_doc_audit_log(entity_type, entity_id);
GRANT SELECT, INSERT ON public.hr_doc_audit_log TO authenticated;
GRANT ALL ON public.hr_doc_audit_log TO service_role;
ALTER TABLE public.hr_doc_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read doc audit" ON public.hr_doc_audit_log
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));
CREATE POLICY "HR staff write doc audit" ON public.hr_doc_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.hr_is_hr_staff(auth.uid()));

-- ---------- seed field catalog ----------
INSERT INTO public.hr_doc_field_catalog (field_key, label, field_group, data_type, formatter, resolver_id, is_sensitive, allows_instances, sort_order) VALUES
 ('employee_name','Employee Full Name','employee','text',NULL,'employee.full_name',false,false,10),
 ('employee_first_name','Employee First Name','employee','text',NULL,'employee.first_name',false,false,11),
 ('employee_badge_id','Employee ID / Badge','employee','text',NULL,'employee.badge_id',false,false,12),
 ('employee_gender','Gender','employee','text',NULL,'employee.gender',false,false,13),
 ('salutation','Salutation (Mr./Ms.)','employee','text',NULL,'derived.salutation',false,false,14),
 ('pronoun_subject','Pronoun (he/she)','employee','text',NULL,'derived.pronoun_subject',false,false,15),
 ('pronoun_possessive','Pronoun (his/her)','employee','text',NULL,'derived.pronoun_possessive',false,false,16),
 ('employee_address','Employee Address','employee','text',NULL,'employee.address',false,false,17),
 ('employee_phone','Employee Phone','employee','text',NULL,'employee.phone',false,false,18),
 ('employee_email','Employee Email','employee','text',NULL,'employee.email',false,false,19),
 ('employee_pan','PAN Number','employee','text',NULL,'employee.pan',true,false,20),
 ('designation','Designation','employment','text',NULL,'employment.designation',false,false,30),
 ('department','Department','employment','text',NULL,'employment.department',false,false,31),
 ('date_of_joining','Date of Joining','employment','date','DD MMM YYYY','employment.date_of_joining',false,false,32),
 ('last_working_day','Last Working Day','employment','date','DD MMM YYYY','employment.last_working_day',false,false,33),
 ('tenure','Tenure (DOJ to LWD)','employment','text',NULL,'derived.tenure',false,false,34),
 ('employment_type','Employment Type','employment','text',NULL,'employment.employment_type',false,false,35),
 ('reporting_manager','Reporting Manager','employment','text',NULL,'employment.reporting_manager',false,false,36),
 ('work_location','Work Location','employment','text',NULL,'employment.work_location',false,false,37),
 ('conduct','Conduct Remark','employment','text',NULL,NULL,false,false,38),
 ('annual_ctc','Annual CTC','salary','currency','INR','salary.annual_ctc',true,false,50),
 ('annual_ctc_words','Annual CTC in Words','salary','text','indian_words','derived.annual_ctc_words',true,false,51),
 ('monthly_gross','Monthly Gross','salary','currency','INR','salary.monthly_gross',true,false,52),
 ('company_name','Company Name','company','text',NULL,'company.name',false,false,70),
 ('company_legal_name','Company Legal Name','company','text',NULL,'company.legal_name',false,false,71),
 ('company_address','Company Address','company','text',NULL,'company.address',false,false,72),
 ('company_cin','Company CIN','company','text',NULL,'company.cin',false,false,73),
 ('company_gstin','Company GSTIN','company','text',NULL,'company.gstin',false,false,74),
 ('sign','Signature','signatory','signature',NULL,'signatory.signature',false,true,90),
 ('signatory_name','Signatory Name','signatory','text',NULL,'signatory.name',false,true,91),
 ('signatory_designation','Signatory Designation','signatory','text',NULL,'signatory.designation',false,true,92),
 ('seal','Company Seal','signatory','image',NULL,'signatory.seal',false,true,93),
 ('letter_date','Letter Date','system','date','DD MMM YYYY','system.today',false,true,110),
 ('reference_no','Reference Number','system','text',NULL,'system.reference_no',false,false,111),
 ('generated_by','Generated By','system','text',NULL,'system.actor_name',false,false,112);
