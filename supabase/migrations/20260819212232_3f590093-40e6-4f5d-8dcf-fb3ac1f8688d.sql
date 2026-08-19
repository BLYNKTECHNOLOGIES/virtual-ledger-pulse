CREATE POLICY "Employees read own issued letters"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-doc-issued'
  AND (storage.foldername(name))[1] = public.hr_ess_current_employee_id()::text
);