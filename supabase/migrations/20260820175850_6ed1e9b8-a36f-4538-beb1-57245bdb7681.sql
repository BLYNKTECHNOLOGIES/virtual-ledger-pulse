-- ============ A) users: restrict PII rows, add safe directory ============
CREATE OR REPLACE VIEW public.users_directory
WITH (security_invoker = off) AS
  SELECT id, username, first_name, last_name, avatar_url, status,
         role_id, badge_id, department_id, position_id, last_activity, created_at
  FROM public.users;

REVOKE ALL ON public.users_directory FROM PUBLIC, anon;
GRANT SELECT ON public.users_directory TO authenticated;
GRANT SELECT ON public.users_directory TO service_role;

CREATE OR REPLACE FUNCTION public.users_can_read_full(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.hr_is_hr_staff(_user_id)
    OR public.has_permission(_user_id, 'user_management_view'::app_permission)
    OR public.has_permission(_user_id, 'user_management_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_users'::app_permission)
    OR public.has_permission(_user_id, 'READ_USERS'::app_permission)
  )
$$;
REVOKE ALL ON FUNCTION public.users_can_read_full(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.users_can_read_full(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS authenticated_read_users ON public.users;
CREATE POLICY users_read_self_or_privileged ON public.users
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR public.users_can_read_full((SELECT auth.uid())));

-- targeted contact lookup for notification flows (no enumeration: explicit ids only)
CREATE OR REPLACE FUNCTION public.get_users_contact(_ids uuid[])
RETURNS TABLE(id uuid, email text, first_name text, last_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, u.first_name, u.last_name, u.username
  FROM public.users u
  WHERE auth.uid() IS NOT NULL
    AND _ids IS NOT NULL
    AND array_length(_ids, 1) IS NOT NULL
    AND array_length(_ids, 1) <= 200
    AND u.id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.get_users_contact(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_contact(uuid[]) TO authenticated, service_role;

-- ============ B) banking_credentials: narrow from is_manager ============
CREATE OR REPLACE FUNCTION public.can_access_banking_credentials(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'super admin')
    OR public.has_permission(_user_id, 'bams_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_banking'::app_permission)
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_banking_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_banking_credentials(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS managers_read_banking_credentials ON public.banking_credentials;
DROP POLICY IF EXISTS managers_insert_banking_credentials ON public.banking_credentials;
DROP POLICY IF EXISTS managers_update_banking_credentials ON public.banking_credentials;

CREATE POLICY banking_credentials_read ON public.banking_credentials
FOR SELECT TO authenticated USING (public.can_access_banking_credentials((SELECT auth.uid())));
CREATE POLICY banking_credentials_insert ON public.banking_credentials
FOR INSERT TO authenticated WITH CHECK (public.can_access_banking_credentials((SELECT auth.uid())));
CREATE POLICY banking_credentials_update ON public.banking_credentials
FOR UPDATE TO authenticated USING (public.can_access_banking_credentials((SELECT auth.uid())))
WITH CHECK (public.can_access_banking_credentials((SELECT auth.uid())));

-- ============ C) hr_pay_heads: read-all, HR/payroll-only writes ============
CREATE OR REPLACE FUNCTION public.hr_can_manage_payroll_config(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.hr_is_hr_staff(_user_id)
    OR public.has_permission(_user_id, 'payroll_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_payroll'::app_permission)
    OR public.has_permission(_user_id, 'hrms_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_hrms'::app_permission)
  )
$$;
REVOKE ALL ON FUNCTION public.hr_can_manage_payroll_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_can_manage_payroll_config(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS hr_pay_heads_authenticated_all ON public.hr_pay_heads;
CREATE POLICY hr_pay_heads_read ON public.hr_pay_heads
FOR SELECT TO authenticated USING (true);
CREATE POLICY hr_pay_heads_write ON public.hr_pay_heads
FOR ALL TO authenticated
USING (public.hr_can_manage_payroll_config((SELECT auth.uid())))
WITH CHECK (public.hr_can_manage_payroll_config((SELECT auth.uid())));

-- ============ D) sensitive business tables: permission-scoped ============
-- client KYC documents
CREATE OR REPLACE FUNCTION public.can_access_client_kyc(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'clients_view'::app_permission)
    OR public.has_permission(_user_id, 'clients_manage'::app_permission)
    OR public.has_permission(_user_id, 'manage_clients'::app_permission)
    OR public.has_permission(_user_id, 'view_clients'::app_permission)
    OR public.has_permission(_user_id, 'kyc_approvals_view'::app_permission)
    OR public.has_permission(_user_id, 'kyc_approvals_manage'::app_permission)
    OR public.has_permission(_user_id, 'video_kyc_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_client_kyc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client_kyc(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can view kyc documents" ON public.client_kyc_documents;
DROP POLICY IF EXISTS "Authenticated users can insert kyc documents" ON public.client_kyc_documents;
DROP POLICY IF EXISTS "Authenticated users can update kyc documents" ON public.client_kyc_documents;
DROP POLICY IF EXISTS "Authenticated users can delete kyc documents" ON public.client_kyc_documents;

CREATE POLICY client_kyc_documents_read ON public.client_kyc_documents
FOR SELECT TO authenticated USING (public.can_access_client_kyc((SELECT auth.uid())));
CREATE POLICY client_kyc_documents_write ON public.client_kyc_documents
FOR ALL TO authenticated
USING (public.can_access_client_kyc((SELECT auth.uid())))
WITH CHECK (public.can_access_client_kyc((SELECT auth.uid())));

-- TDS allocations
CREATE OR REPLACE FUNCTION public.can_access_tax_records(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR public.has_permission(_user_id, 'accounting_view'::app_permission)
    OR public.has_permission(_user_id, 'accounting_manage'::app_permission)
    OR public.has_permission(_user_id, 'view_accounting'::app_permission)
    OR public.has_permission(_user_id, 'manage_accounting'::app_permission)
    OR public.has_permission(_user_id, 'compliance_view'::app_permission)
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_tax_records(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_tax_records(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can view tds allocations" ON public.tds_payment_allocations;
DROP POLICY IF EXISTS "Authenticated can insert tds allocations" ON public.tds_payment_allocations;
DROP POLICY IF EXISTS "Authenticated can update tds allocations" ON public.tds_payment_allocations;
DROP POLICY IF EXISTS "Authenticated can delete tds allocations" ON public.tds_payment_allocations;

CREATE POLICY tds_payment_allocations_read ON public.tds_payment_allocations
FOR SELECT TO authenticated USING (public.can_access_tax_records((SELECT auth.uid())));
CREATE POLICY tds_payment_allocations_write ON public.tds_payment_allocations
FOR ALL TO authenticated
USING (public.can_access_tax_records((SELECT auth.uid())))
WITH CHECK (public.can_access_tax_records((SELECT auth.uid())));

-- employee deposits
DROP POLICY IF EXISTS authenticated_all_hr_employee_deposits ON public.hr_employee_deposits;
CREATE POLICY hr_employee_deposits_hr_all ON public.hr_employee_deposits
FOR ALL TO authenticated
USING (public.hr_can_manage_payroll_config((SELECT auth.uid())))
WITH CHECK (public.hr_can_manage_payroll_config((SELECT auth.uid())));

-- ============ E) pending_registrations ============
DROP POLICY IF EXISTS manage_pending_registrations ON public.pending_registrations;
CREATE POLICY pending_registrations_admin_all ON public.pending_registrations
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super admin')
  OR public.has_permission((SELECT auth.uid()), 'user_management_manage'::app_permission)
  OR public.has_permission((SELECT auth.uid()), 'manage_users'::app_permission)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super admin')
  OR public.has_permission((SELECT auth.uid()), 'user_management_manage'::app_permission)
  OR public.has_permission((SELECT auth.uid()), 'manage_users'::app_permission)
);

-- ============ F) revoke anon EXECUTE on SECURITY DEFINER functions ============
REVOKE ALL ON FUNCTION public.hr_sync_onboarding_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_sync_onboarding_documents(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.verify_erp_sync_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_erp_sync_access(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_can_read_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_can_write_sensitive_bucket(text, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_onboarding_documents_sync_trg() FROM PUBLIC, anon;