CREATE POLICY "Authenticated can read ra-remarks files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ra-remarks');
CREATE POLICY "Authenticated can upload ra-remarks files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ra-remarks');
CREATE POLICY "Authenticated can update ra-remarks files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ra-remarks') WITH CHECK (bucket_id = 'ra-remarks');