-- 1. Legacy employees table: HR/admin full access, self read-only
DROP POLICY IF EXISTS "authenticated_all_employees" ON public.employees;

CREATE POLICY "employees_hr_staff_all"
ON public.employees FOR ALL
TO authenticated
USING (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage'))
WITH CHECK (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage'));

CREATE POLICY "employees_self_select"
ON public.employees FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Biometric devices: HR/admin only (credentials column)
DROP POLICY IF EXISTS "authenticated_all_hr_biometric_devices" ON public.hr_biometric_devices;

CREATE POLICY "hr_biometric_devices_hr_staff_all"
ON public.hr_biometric_devices FOR ALL
TO authenticated
USING (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage'))
WITH CHECK (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage'));

-- 3. Storage INSERT: no self-owner short-circuit on fresh uploads
DROP POLICY IF EXISTS "sensitive_docs_scoped_insert" ON storage.objects;

CREATE POLICY "sensitive_docs_scoped_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_write_sensitive_bucket(bucket_id, auth.uid(), NULL::uuid)
);