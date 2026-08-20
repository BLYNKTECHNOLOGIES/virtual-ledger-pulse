
-- Helper: permission-scoped access to sensitive storage buckets
CREATE OR REPLACE FUNCTION public.storage_can_read_sensitive_bucket(_bucket text, _uid uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
      public.has_permission(_uid, 'super_admin_access')
      OR public.has_permission(_uid, 'admin_access')
      OR (_owner IS NOT NULL AND _owner = _uid)
      OR CASE _bucket
        WHEN 'kyc-documents' THEN
          public.has_permission(_uid, 'clients_view')
          OR public.has_permission(_uid, 'kyc_approvals_view')
          OR public.has_permission(_uid, 'compliance_view')
          OR public.has_permission(_uid, 'video_kyc_view')
        WHEN 'employee-documents' THEN
          public.hr_is_hr_staff(_uid)
          OR public.has_permission(_uid, 'hrms_view')
          OR public.has_permission(_uid, 'payroll_view')
        WHEN 'investigation-documents' THEN
          public.has_permission(_uid, 'compliance_view')
          OR public.has_permission(_uid, 'compliance_manage')
        WHEN 'documents' THEN
          public.has_permission(_uid, 'accounting_view')
          OR public.has_permission(_uid, 'bams_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'sales_attachments' THEN
          public.has_permission(_uid, 'sales_view')
          OR public.has_permission(_uid, 'purchase_view')
          OR public.has_permission(_uid, 'accounting_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'transaction-bills' THEN
          public.has_permission(_uid, 'accounting_view')
          OR public.has_permission(_uid, 'bams_view')
          OR public.has_permission(_uid, 'erp_entry_view')
        WHEN 'internal-chat-files' THEN
          public.has_permission(_uid, 'tasks_view')
          OR public.has_permission(_uid, 'ems_view')
          OR public.has_permission(_uid, 'dashboard_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_view')
          OR public.has_permission(_uid, 'ems_view')
        ELSE false
      END
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_can_write_sensitive_bucket(_bucket text, _uid uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
      public.has_permission(_uid, 'super_admin_access')
      OR public.has_permission(_uid, 'admin_access')
      OR (_owner IS NOT NULL AND _owner = _uid)
      OR CASE _bucket
        WHEN 'kyc-documents' THEN
          public.has_permission(_uid, 'clients_manage')
          OR public.has_permission(_uid, 'kyc_approvals_manage')
          OR public.has_permission(_uid, 'compliance_manage')
          OR public.has_permission(_uid, 'video_kyc_manage')
        WHEN 'employee-documents' THEN
          public.hr_is_hr_staff(_uid)
          OR public.has_permission(_uid, 'hrms_manage')
        WHEN 'investigation-documents' THEN
          public.has_permission(_uid, 'compliance_manage')
        WHEN 'documents' THEN
          public.has_permission(_uid, 'accounting_manage')
          OR public.has_permission(_uid, 'bams_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'sales_attachments' THEN
          public.has_permission(_uid, 'sales_manage')
          OR public.has_permission(_uid, 'purchase_manage')
          OR public.has_permission(_uid, 'accounting_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'transaction-bills' THEN
          public.has_permission(_uid, 'accounting_manage')
          OR public.has_permission(_uid, 'bams_manage')
          OR public.has_permission(_uid, 'erp_entry_manage')
        WHEN 'internal-chat-files' THEN
          public.has_permission(_uid, 'tasks_manage')
          OR public.has_permission(_uid, 'ems_manage')
          OR public.has_permission(_uid, 'tasks_view')
        WHEN 'task-attachments' THEN
          public.has_permission(_uid, 'tasks_manage')
          OR public.has_permission(_uid, 'tasks_view')
        ELSE false
      END
    );
$$;

GRANT EXECUTE ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;

-- ===== hr-mail bucket: HR staff only =====
DROP POLICY IF EXISTS "Staff read hr-mail files" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload hr-mail files" ON storage.objects;
DROP POLICY IF EXISTS "Staff update hr-mail files" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete hr-mail files" ON storage.objects;

CREATE POLICY "HR staff read hr-mail files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hr-mail' AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff upload hr-mail files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hr-mail' AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff update hr-mail files" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'hr-mail' AND public.hr_is_hr_staff(auth.uid()))
WITH CHECK (bucket_id = 'hr-mail' AND public.hr_is_hr_staff(auth.uid()));

CREATE POLICY "HR staff delete hr-mail files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hr-mail' AND public.hr_is_hr_staff(auth.uid()));

-- ===== sensitive document buckets: permission scoped =====
DROP POLICY IF EXISTS "sensitive_docs_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "sensitive_docs_authenticated_delete" ON storage.objects;

CREATE POLICY "sensitive_docs_scoped_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_read_sensitive_bucket(bucket_id, auth.uid(), owner)
);

CREATE POLICY "sensitive_docs_scoped_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_write_sensitive_bucket(bucket_id, auth.uid(), auth.uid())
);

CREATE POLICY "sensitive_docs_scoped_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_write_sensitive_bucket(bucket_id, auth.uid(), owner)
)
WITH CHECK (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_write_sensitive_bucket(bucket_id, auth.uid(), owner)
);

CREATE POLICY "sensitive_docs_scoped_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['kyc-documents','employee-documents','investigation-documents','documents','sales_attachments','transaction-bills','internal-chat-files','task-attachments'])
  AND public.storage_can_write_sensitive_bucket(bucket_id, auth.uid(), owner)
);
