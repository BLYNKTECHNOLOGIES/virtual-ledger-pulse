
-- MPI Performance Management Framework
-- Enums
DO $$ BEGIN
  CREATE TYPE public.mpi_department AS ENUM ('operations','compliance','management','hr','sales','technical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.mpi_kpi_category AS ENUM ('productivity','quality','compliance','behavioral','ownership','leadership','retention','reporting');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.mpi_data_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.mpi_grade AS ENUM ('S','A+','A','B','C','D');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.mpi_pip_status AS ENUM ('active','passed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.mpi_violation_severity AS ENUM ('minor','major','critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Scorecard templates per department
CREATE TABLE IF NOT EXISTS public.mpi_scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department mpi_department NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  locked boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department, name)
);

-- 2. KPI definitions per template
CREATE TABLE IF NOT EXISTS public.mpi_kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.mpi_scorecard_templates(id) ON DELETE CASCADE,
  category mpi_kpi_category NOT NULL,
  name text NOT NULL,
  description text,
  weight numeric(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  data_source mpi_data_source NOT NULL DEFAULT 'manual',
  formula_key text,
  target_value numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Monthly scores
CREATE TABLE IF NOT EXISTS public.mpi_monthly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.mpi_scorecard_templates(id),
  kpi_id uuid NOT NULL REFERENCES public.mpi_kpi_definitions(id),
  period_key text NOT NULL, -- YYYY-MM IST
  raw_value numeric,
  normalized_score numeric(5,2) NOT NULL DEFAULT 0, -- 0..100
  weighted_score numeric(7,4) NOT NULL DEFAULT 0,
  is_overridden boolean NOT NULL DEFAULT false,
  override_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, kpi_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_mpi_monthly_scores_emp_period ON public.mpi_monthly_scores(employee_id, period_key);

-- 4. Final monthly result roll-up
CREATE TABLE IF NOT EXISTS public.mpi_monthly_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.mpi_scorecard_templates(id),
  period_key text NOT NULL,
  total_score numeric(5,2) NOT NULL DEFAULT 0,
  grade mpi_grade NOT NULL DEFAULT 'D',
  grade_capped boolean NOT NULL DEFAULT false,
  cap_reason text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_mpi_monthly_results_period ON public.mpi_monthly_results(period_key);

-- 5. Manual score overrides (maker-checker)
CREATE TABLE IF NOT EXISTS public.mpi_score_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  kpi_id uuid NOT NULL REFERENCES public.mpi_kpi_definitions(id),
  period_key text NOT NULL,
  proposed_score numeric(5,2) NOT NULL,
  reason text NOT NULL,
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  CHECK (approved_by IS NULL OR approved_by != proposed_by)
);

-- 6. Critical violations
CREATE TABLE IF NOT EXISTS public.mpi_critical_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  period_key text NOT NULL,
  severity mpi_violation_severity NOT NULL DEFAULT 'critical',
  violation_type text NOT NULL,
  description text NOT NULL,
  evidence_url text,
  reported_by uuid NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  acknowledged boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mpi_violations_emp_period ON public.mpi_critical_violations(employee_id, period_key);

-- 7. PIP records
CREATE TABLE IF NOT EXISTS public.mpi_pip_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status mpi_pip_status NOT NULL DEFAULT 'active',
  triggering_grade mpi_grade,
  target_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  weekly_reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_outcome text,
  created_by uuid NOT NULL,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Audit log
CREATE TABLE IF NOT EXISTS public.mpi_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger fn (reuse existing if present)
CREATE OR REPLACE FUNCTION public.mpi_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_mpi_templates_updated ON public.mpi_scorecard_templates;
CREATE TRIGGER trg_mpi_templates_updated BEFORE UPDATE ON public.mpi_scorecard_templates
FOR EACH ROW EXECUTE FUNCTION public.mpi_set_updated_at();

DROP TRIGGER IF EXISTS trg_mpi_kpi_updated ON public.mpi_kpi_definitions;
CREATE TRIGGER trg_mpi_kpi_updated BEFORE UPDATE ON public.mpi_kpi_definitions
FOR EACH ROW EXECUTE FUNCTION public.mpi_set_updated_at();

DROP TRIGGER IF EXISTS trg_mpi_scores_updated ON public.mpi_monthly_scores;
CREATE TRIGGER trg_mpi_scores_updated BEFORE UPDATE ON public.mpi_monthly_scores
FOR EACH ROW EXECUTE FUNCTION public.mpi_set_updated_at();

DROP TRIGGER IF EXISTS trg_mpi_pip_updated ON public.mpi_pip_records;
CREATE TRIGGER trg_mpi_pip_updated BEFORE UPDATE ON public.mpi_pip_records
FOR EACH ROW EXECUTE FUNCTION public.mpi_set_updated_at();

-- RLS
ALTER TABLE public.mpi_scorecard_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_monthly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_monthly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_score_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_critical_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_pip_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpi_audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: who can view MPI (HR / Admin / Super Admin / Managers)
-- Reuse existing has_role / has_permission patterns. Fallback to authenticated read.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='has_permission') THEN
    EXECUTE 'CREATE POLICY mpi_templates_select ON public.mpi_scorecard_templates FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view'') OR public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';
    EXECUTE 'CREATE POLICY mpi_templates_admin ON public.mpi_scorecard_templates FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_admin''))';

    EXECUTE 'CREATE POLICY mpi_kpi_select ON public.mpi_kpi_definitions FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view'') OR public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';
    EXECUTE 'CREATE POLICY mpi_kpi_admin ON public.mpi_kpi_definitions FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_admin''))';

    EXECUTE 'CREATE POLICY mpi_scores_select ON public.mpi_monthly_scores FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view'') OR public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'') OR employee_id = auth.uid())';
    EXECUTE 'CREATE POLICY mpi_scores_manage ON public.mpi_monthly_scores FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';

    EXECUTE 'CREATE POLICY mpi_results_select ON public.mpi_monthly_results FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view'') OR public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'') OR employee_id = auth.uid())';
    EXECUTE 'CREATE POLICY mpi_results_manage ON public.mpi_monthly_results FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';

    EXECUTE 'CREATE POLICY mpi_overrides_rw ON public.mpi_score_overrides FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';

    EXECUTE 'CREATE POLICY mpi_violations_rw ON public.mpi_critical_violations FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';
    EXECUTE 'CREATE POLICY mpi_violations_view ON public.mpi_critical_violations FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view''))';

    EXECUTE 'CREATE POLICY mpi_pip_rw ON public.mpi_pip_records FOR ALL TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin'')) WITH CHECK (public.has_permission(auth.uid(),''hr_mpi_manage'') OR public.has_permission(auth.uid(),''hr_mpi_admin''))';
    EXECUTE 'CREATE POLICY mpi_pip_view ON public.mpi_pip_records FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_view'') OR employee_id = auth.uid())';

    EXECUTE 'CREATE POLICY mpi_audit_select ON public.mpi_audit_log FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),''hr_mpi_admin''))';
    EXECUTE 'CREATE POLICY mpi_audit_insert ON public.mpi_audit_log FOR INSERT TO authenticated WITH CHECK (true)';
  ELSE
    -- Fallback: authenticated full access (project does not have has_permission)
    EXECUTE 'CREATE POLICY mpi_templates_all ON public.mpi_scorecard_templates FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_kpi_all ON public.mpi_kpi_definitions FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_scores_all ON public.mpi_monthly_scores FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_results_all ON public.mpi_monthly_results FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_overrides_all ON public.mpi_score_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_violations_all ON public.mpi_critical_violations FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_pip_all ON public.mpi_pip_records FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY mpi_audit_all ON public.mpi_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Seed templates + KPIs for Operations
DO $$
DECLARE tpl_id uuid;
BEGIN
  -- OPERATIONS
  INSERT INTO public.mpi_scorecard_templates(department, name, description)
  VALUES ('operations','Operations Executive (P2P)','Default scorecard for P2P operators / shift executives')
  ON CONFLICT (department, name) DO NOTHING
  RETURNING id INTO tpl_id;
  IF tpl_id IS NULL THEN
    SELECT id INTO tpl_id FROM public.mpi_scorecard_templates WHERE department='operations' AND name='Operations Executive (P2P)';
  END IF;
  INSERT INTO public.mpi_kpi_definitions(template_id, category, name, weight, data_source, formula_key) VALUES
    (tpl_id,'productivity','Orders Completed',10,'auto','orders_completed'),
    (tpl_id,'productivity','Order Volume (USDT)',10,'auto','order_volume_usdt'),
    (tpl_id,'productivity','Response Time',5,'auto','response_time'),
    (tpl_id,'productivity','Shift Adherence',5,'auto','shift_adherence'),
    (tpl_id,'productivity','Queue Handling Efficiency',5,'auto','queue_efficiency'),
    (tpl_id,'quality','Error Rate',10,'manual','error_rate'),
    (tpl_id,'quality','Appeal Ratio',5,'auto','appeal_ratio'),
    (tpl_id,'quality','Customer Rating',5,'auto','customer_rating'),
    (tpl_id,'quality','Documentation Accuracy',5,'manual','doc_accuracy'),
    (tpl_id,'compliance','SOP Adherence',10,'manual','sop_adherence'),
    (tpl_id,'compliance','Third Party Payment Detection',5,'manual','third_party_detect'),
    (tpl_id,'compliance','Escalation Accuracy',5,'manual','escalation_accuracy'),
    (tpl_id,'behavioral','Professional Communication',3,'manual','communication'),
    (tpl_id,'behavioral','Team Coordination',3,'manual','coordination'),
    (tpl_id,'behavioral','Attendance & Punctuality',4,'auto','attendance_punctuality'),
    (tpl_id,'ownership','Problem Solving',4,'manual','problem_solving'),
    (tpl_id,'ownership','Initiative Taken',3,'manual','initiative'),
    (tpl_id,'ownership','Training Participation',3,'manual','training')
  ON CONFLICT DO NOTHING;

  -- MANAGEMENT
  INSERT INTO public.mpi_scorecard_templates(department, name, description)
  VALUES ('management','Operations Manager','Default scorecard for operations managers')
  ON CONFLICT (department, name) DO NOTHING RETURNING id INTO tpl_id;
  IF tpl_id IS NULL THEN SELECT id INTO tpl_id FROM public.mpi_scorecard_templates WHERE department='management' AND name='Operations Manager'; END IF;
  INSERT INTO public.mpi_kpi_definitions(template_id, category, name, weight, data_source, formula_key) VALUES
    (tpl_id,'productivity','Team Productivity',25,'auto','team_productivity'),
    (tpl_id,'quality','Team Error Reduction',20,'auto','team_error_reduction'),
    (tpl_id,'compliance','Escalation Handling',15,'manual','escalation_handling'),
    (tpl_id,'retention','Staff Retention',10,'auto','staff_retention'),
    (tpl_id,'compliance','SOP Compliance',15,'manual','sop_compliance_mgr'),
    (tpl_id,'reporting','Reporting Accuracy',10,'manual','reporting_accuracy'),
    (tpl_id,'leadership','Leadership',5,'manual','leadership')
  ON CONFLICT DO NOTHING;

  -- HR
  INSERT INTO public.mpi_scorecard_templates(department, name, description)
  VALUES ('hr','HR / Recruitment','Default scorecard for HR & recruitment roles')
  ON CONFLICT (department, name) DO NOTHING RETURNING id INTO tpl_id;
  IF tpl_id IS NULL THEN SELECT id INTO tpl_id FROM public.mpi_scorecard_templates WHERE department='hr' AND name='HR / Recruitment'; END IF;
  INSERT INTO public.mpi_kpi_definitions(template_id, category, name, weight, data_source, formula_key) VALUES
    (tpl_id,'productivity','Hiring Closure Rate',20,'manual','hiring_closure'),
    (tpl_id,'retention','Retention Rate',20,'auto','retention_rate'),
    (tpl_id,'behavioral','Employee Satisfaction',15,'manual','employee_satisfaction'),
    (tpl_id,'compliance','Policy Compliance',15,'manual','policy_compliance'),
    (tpl_id,'quality','Documentation Accuracy',10,'manual','hr_doc_accuracy'),
    (tpl_id,'ownership','Training Execution',10,'manual','training_execution'),
    (tpl_id,'compliance','Discipline Handling',10,'manual','discipline_handling')
  ON CONFLICT DO NOTHING;

  -- COMPLIANCE
  INSERT INTO public.mpi_scorecard_templates(department, name, description)
  VALUES ('compliance','Compliance / KYC Officer','Default scorecard for ICO, ECO, KYC team')
  ON CONFLICT (department, name) DO NOTHING RETURNING id INTO tpl_id;
  IF tpl_id IS NULL THEN SELECT id INTO tpl_id FROM public.mpi_scorecard_templates WHERE department='compliance' AND name='Compliance / KYC Officer'; END IF;
  INSERT INTO public.mpi_kpi_definitions(template_id, category, name, weight, data_source, formula_key) VALUES
    (tpl_id,'compliance','KYC Approval Accuracy',20,'manual','kyc_accuracy'),
    (tpl_id,'compliance','SOP Adherence',20,'manual','sop_adherence'),
    (tpl_id,'quality','Investigation Quality',15,'manual','investigation_quality'),
    (tpl_id,'productivity','Cases Handled',15,'auto','cases_handled'),
    (tpl_id,'reporting','Reporting Accuracy',10,'manual','compliance_reporting'),
    (tpl_id,'behavioral','Attendance & Punctuality',10,'auto','attendance_punctuality'),
    (tpl_id,'ownership','Risk Detection Initiative',10,'manual','risk_initiative')
  ON CONFLICT DO NOTHING;
END $$;
