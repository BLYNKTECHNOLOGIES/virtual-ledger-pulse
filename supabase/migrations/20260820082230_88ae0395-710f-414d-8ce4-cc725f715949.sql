-- 1. Shadow payroll tables: drop permissive SELECT policies, recreate HR-only
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('hr_shadow_payroll_lines','hr_shadow_component_breakdown','hr_shadow_payroll_runs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "HR staff read shadow runs" ON public.hr_shadow_payroll_runs
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.hr_payroll_cockpit_authorized(auth.uid()));
CREATE POLICY "HR staff read shadow lines" ON public.hr_shadow_payroll_lines
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.hr_payroll_cockpit_authorized(auth.uid()));
CREATE POLICY "HR staff read shadow components" ON public.hr_shadow_component_breakdown
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.hr_payroll_cockpit_authorized(auth.uid()));

REVOKE ALL ON public.hr_shadow_payroll_runs FROM anon;
REVOKE ALL ON public.hr_shadow_payroll_lines FROM anon;
REVOKE ALL ON public.hr_shadow_component_breakdown FROM anon;
GRANT SELECT ON public.hr_shadow_payroll_runs TO authenticated;
GRANT SELECT ON public.hr_shadow_payroll_lines TO authenticated;
GRANT SELECT ON public.hr_shadow_component_breakdown TO authenticated;
GRANT ALL ON public.hr_shadow_payroll_runs TO service_role;
GRANT ALL ON public.hr_shadow_payroll_lines TO service_role;
GRANT ALL ON public.hr_shadow_component_breakdown TO service_role;

-- 2. Task attachment storage: remove anon access
DROP POLICY IF EXISTS "Anyone can upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete task attachments" ON storage.objects;
DROP POLICY IF EXISTS "anon_all_task_attachments_storage" ON storage.objects;

CREATE POLICY "Authenticated upload task attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated read task attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated update task attachments" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'task-attachments') WITH CHECK (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated delete task attachments" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'task-attachments');