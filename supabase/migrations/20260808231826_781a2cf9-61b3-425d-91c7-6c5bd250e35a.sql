CREATE POLICY "Staff read hr-mail files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'hr-mail');
CREATE POLICY "Staff upload hr-mail files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'hr-mail');
CREATE POLICY "Staff update hr-mail files" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'hr-mail');
CREATE POLICY "Staff delete hr-mail files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'hr-mail');