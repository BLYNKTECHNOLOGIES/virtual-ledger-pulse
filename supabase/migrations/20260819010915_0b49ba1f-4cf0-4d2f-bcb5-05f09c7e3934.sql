
CREATE POLICY "HR staff read hr doc buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('hr-doc-templates','hr-doc-signatures','hr-doc-issued') AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff insert hr doc buckets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('hr-doc-templates','hr-doc-signatures','hr-doc-issued') AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff update hr doc buckets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('hr-doc-templates','hr-doc-signatures','hr-doc-issued') AND public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (bucket_id IN ('hr-doc-templates','hr-doc-signatures','hr-doc-issued') AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff delete hr doc buckets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('hr-doc-templates','hr-doc-signatures','hr-doc-issued') AND public.hr_is_hr_staff(auth.uid()));
