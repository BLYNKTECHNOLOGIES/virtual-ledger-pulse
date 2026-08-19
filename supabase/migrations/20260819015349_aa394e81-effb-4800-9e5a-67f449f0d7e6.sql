DROP POLICY IF EXISTS "company identity files readable" ON storage.objects;
CREATE POLICY "company identity files readable" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-identity');

DROP POLICY IF EXISTS "company identity files managed by hr" ON storage.objects;
CREATE POLICY "company identity files managed by hr" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'company-identity' AND public.hr_is_hr_staff(auth.uid()))
  WITH CHECK (bucket_id = 'company-identity' AND public.hr_is_hr_staff(auth.uid()));