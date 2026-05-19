
-- Drop fallback permissive policies
DROP POLICY IF EXISTS mpi_templates_all ON public.mpi_scorecard_templates;
DROP POLICY IF EXISTS mpi_kpi_all ON public.mpi_kpi_definitions;
DROP POLICY IF EXISTS mpi_scores_all ON public.mpi_monthly_scores;
DROP POLICY IF EXISTS mpi_results_all ON public.mpi_monthly_results;
DROP POLICY IF EXISTS mpi_overrides_all ON public.mpi_score_overrides;
DROP POLICY IF EXISTS mpi_violations_all ON public.mpi_critical_violations;
DROP POLICY IF EXISTS mpi_pip_all ON public.mpi_pip_records;
DROP POLICY IF EXISTS mpi_audit_all ON public.mpi_audit_log;

-- Helper view: MPI viewer / manager / admin
CREATE OR REPLACE FUNCTION public.mpi_can_view(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_uid,'Super Admin') OR public.has_role(_uid,'Admin')
      OR public.has_role(_uid,'HR Manager') OR public.has_role(_uid,'COO')
      OR public.has_role(_uid,'Auditor');
$$;

CREATE OR REPLACE FUNCTION public.mpi_can_manage(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_uid,'Super Admin') OR public.has_role(_uid,'Admin')
      OR public.has_role(_uid,'HR Manager') OR public.has_role(_uid,'COO');
$$;

CREATE OR REPLACE FUNCTION public.mpi_is_admin(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_uid,'Super Admin');
$$;

-- Templates
CREATE POLICY mpi_tpl_view ON public.mpi_scorecard_templates FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()));
CREATE POLICY mpi_tpl_admin_ins ON public.mpi_scorecard_templates FOR INSERT TO authenticated
  WITH CHECK (public.mpi_is_admin(auth.uid()));
CREATE POLICY mpi_tpl_admin_upd ON public.mpi_scorecard_templates FOR UPDATE TO authenticated
  USING (public.mpi_is_admin(auth.uid())) WITH CHECK (public.mpi_is_admin(auth.uid()));
CREATE POLICY mpi_tpl_admin_del ON public.mpi_scorecard_templates FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- KPI defs
CREATE POLICY mpi_kpi_view ON public.mpi_kpi_definitions FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()));
CREATE POLICY mpi_kpi_admin_ins ON public.mpi_kpi_definitions FOR INSERT TO authenticated
  WITH CHECK (public.mpi_is_admin(auth.uid()));
CREATE POLICY mpi_kpi_admin_upd ON public.mpi_kpi_definitions FOR UPDATE TO authenticated
  USING (public.mpi_is_admin(auth.uid())) WITH CHECK (public.mpi_is_admin(auth.uid()));
CREATE POLICY mpi_kpi_admin_del ON public.mpi_kpi_definitions FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- Monthly scores
CREATE POLICY mpi_scores_view ON public.mpi_monthly_scores FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()) OR employee_id = auth.uid());
CREATE POLICY mpi_scores_mgr_ins ON public.mpi_monthly_scores FOR INSERT TO authenticated
  WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_scores_mgr_upd ON public.mpi_monthly_scores FOR UPDATE TO authenticated
  USING (public.mpi_can_manage(auth.uid())) WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_scores_mgr_del ON public.mpi_monthly_scores FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- Results
CREATE POLICY mpi_res_view ON public.mpi_monthly_results FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()) OR employee_id = auth.uid());
CREATE POLICY mpi_res_mgr_ins ON public.mpi_monthly_results FOR INSERT TO authenticated
  WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_res_mgr_upd ON public.mpi_monthly_results FOR UPDATE TO authenticated
  USING (public.mpi_can_manage(auth.uid())) WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_res_mgr_del ON public.mpi_monthly_results FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- Overrides
CREATE POLICY mpi_ovr_view ON public.mpi_score_overrides FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()));
CREATE POLICY mpi_ovr_ins ON public.mpi_score_overrides FOR INSERT TO authenticated
  WITH CHECK (public.mpi_can_manage(auth.uid()) AND proposed_by = auth.uid());
CREATE POLICY mpi_ovr_upd ON public.mpi_score_overrides FOR UPDATE TO authenticated
  USING (public.mpi_can_manage(auth.uid())) WITH CHECK (public.mpi_can_manage(auth.uid()));

-- Violations
CREATE POLICY mpi_vio_view ON public.mpi_critical_violations FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()) OR employee_id = auth.uid());
CREATE POLICY mpi_vio_ins ON public.mpi_critical_violations FOR INSERT TO authenticated
  WITH CHECK (public.mpi_can_manage(auth.uid()) AND reported_by = auth.uid());
CREATE POLICY mpi_vio_upd ON public.mpi_critical_violations FOR UPDATE TO authenticated
  USING (public.mpi_can_manage(auth.uid())) WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_vio_del ON public.mpi_critical_violations FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- PIP
CREATE POLICY mpi_pip_view ON public.mpi_pip_records FOR SELECT TO authenticated
  USING (public.mpi_can_view(auth.uid()) OR employee_id = auth.uid());
CREATE POLICY mpi_pip_ins ON public.mpi_pip_records FOR INSERT TO authenticated
  WITH CHECK (public.mpi_can_manage(auth.uid()) AND created_by = auth.uid());
CREATE POLICY mpi_pip_upd ON public.mpi_pip_records FOR UPDATE TO authenticated
  USING (public.mpi_can_manage(auth.uid())) WITH CHECK (public.mpi_can_manage(auth.uid()));
CREATE POLICY mpi_pip_del ON public.mpi_pip_records FOR DELETE TO authenticated
  USING (public.mpi_is_admin(auth.uid()));

-- Audit
CREATE POLICY mpi_aud_view ON public.mpi_audit_log FOR SELECT TO authenticated
  USING (public.mpi_is_admin(auth.uid()));
CREATE POLICY mpi_aud_ins ON public.mpi_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
