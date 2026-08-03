DROP POLICY IF EXISTS "payslips payroll read" ON storage.objects;
CREATE POLICY "payslips payroll read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payslips' AND public.hr_payroll_cockpit_authorized(auth.uid()));

DROP POLICY IF EXISTS "payslips payroll insert" ON storage.objects;
CREATE POLICY "payslips payroll insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payslips' AND public.hr_payroll_cockpit_authorized(auth.uid()));

DROP POLICY IF EXISTS "payslips payroll update" ON storage.objects;
CREATE POLICY "payslips payroll update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'payslips' AND public.hr_payroll_cockpit_authorized(auth.uid()))
  WITH CHECK (bucket_id = 'payslips' AND public.hr_payroll_cockpit_authorized(auth.uid()));

DROP POLICY IF EXISTS "payslips payroll delete" ON storage.objects;
CREATE POLICY "payslips payroll delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payslips' AND public.hr_payroll_cockpit_authorized(auth.uid()));