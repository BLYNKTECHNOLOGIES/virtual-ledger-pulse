-- =====================================================
-- PHASE 4 BATCH 1: Critical Security Tables + has_role function
-- =====================================================

-- 1. Create the has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND lower(r.name) = lower(_role)
  )
$$;

-- Helper: check if user has ANY management role
CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND lower(r.name) IN ('super admin', 'admin', 'coo')
  )
$$;

-- =====================================================
-- USERS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Allow users table updates" ON public.users;
DROP POLICY IF EXISTS "Allow users table deletes" ON public.users;
DROP POLICY IF EXISTS "Allow users table inserts" ON public.users;
DROP POLICY IF EXISTS "Allow authentication access" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to view users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;

CREATE POLICY "authenticated_read_users" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_users_for_login" ON public.users
  FOR SELECT TO anon USING (true);

CREATE POLICY "managers_insert_users" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "managers_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "superadmin_delete_users" ON public.users
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

-- =====================================================
-- ROLES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Allow all operations on roles" ON public.roles;

CREATE POLICY "authenticated_read_roles" ON public.roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_roles" ON public.roles
  FOR SELECT TO anon USING (true);

CREATE POLICY "superadmin_write_roles" ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_update_roles" ON public.roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_delete_roles" ON public.roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

-- =====================================================
-- USER_ROLES TABLE
-- =====================================================
DROP POLICY IF EXISTS "Allow all operations on user_roles" ON public.user_roles;

CREATE POLICY "authenticated_read_user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_user_roles" ON public.user_roles
  FOR SELECT TO anon USING (true);

CREATE POLICY "managers_insert_user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "managers_update_user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "managers_delete_user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()));

-- =====================================================
-- ROLE_PERMISSIONS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Allow all operations on role_permissions" ON public.role_permissions;

CREATE POLICY "authenticated_read_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_role_permissions" ON public.role_permissions
  FOR SELECT TO anon USING (true);

CREATE POLICY "superadmin_write_role_permissions" ON public.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_update_role_permissions" ON public.role_permissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_delete_role_permissions" ON public.role_permissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

-- =====================================================
-- ROLE_FUNCTIONS TABLE
-- =====================================================
DROP POLICY IF EXISTS "Allow all operations on role_functions" ON public.role_functions;

CREATE POLICY "authenticated_read_role_functions" ON public.role_functions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "superadmin_write_role_functions" ON public.role_functions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_update_role_functions" ON public.role_functions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

CREATE POLICY "superadmin_delete_role_functions" ON public.role_functions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

-- =====================================================
-- BANKING_CREDENTIALS (most sensitive)
-- =====================================================
DROP POLICY IF EXISTS "Allow all operations on banking_credentials" ON public.banking_credentials;

CREATE POLICY "managers_read_banking_credentials" ON public.banking_credentials
  FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE POLICY "managers_insert_banking_credentials" ON public.banking_credentials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "managers_update_banking_credentials" ON public.banking_credentials
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "managers_delete_banking_credentials" ON public.banking_credentials
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'));

-- =====================================================
-- ERP_ACTION_QUEUE (was open to anon)
-- =====================================================
DROP POLICY IF EXISTS "Anon can update erp_action_queue" ON public.erp_action_queue;
DROP POLICY IF EXISTS "Anon can view erp_action_queue" ON public.erp_action_queue;
DROP POLICY IF EXISTS "Anon can insert erp_action_queue" ON public.erp_action_queue;
DROP POLICY IF EXISTS "Allow all operations on erp_action_queue" ON public.erp_action_queue;
DROP POLICY IF EXISTS "Authenticated can manage erp_action_queue" ON public.erp_action_queue;

CREATE POLICY "authenticated_all_erp_action_queue" ON public.erp_action_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_all_erp_action_queue" ON public.erp_action_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- SHIFT_RECONCILIATIONS (was open to anon)
-- =====================================================
DROP POLICY IF EXISTS "Allow anon insert on shift_reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Allow anon update on shift_reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Allow all operations on shift_reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Anyone can read shift_reconciliations" ON public.shift_reconciliations;
DROP POLICY IF EXISTS "Authenticated users can manage shift_reconciliations" ON public.shift_reconciliations;

CREATE POLICY "authenticated_all_shift_reconciliations" ON public.shift_reconciliations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- ERP_TASK* TABLES (7 tables — all were open to anon)
-- =====================================================
DROP POLICY IF EXISTS "anon_all_erp_tasks" ON public.erp_tasks;
CREATE POLICY "authenticated_all_erp_tasks" ON public.erp_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_tasks" ON public.erp_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_assignments" ON public.erp_task_assignments;
CREATE POLICY "authenticated_all_erp_task_assignments" ON public.erp_task_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_task_assignments" ON public.erp_task_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_comments" ON public.erp_task_comments;
CREATE POLICY "authenticated_all_erp_task_comments" ON public.erp_task_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_activity_log" ON public.erp_task_activity_log;
CREATE POLICY "authenticated_all_erp_task_activity_log" ON public.erp_task_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_all_erp_task_activity_log" ON public.erp_task_activity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_attachments" ON public.erp_task_attachments;
CREATE POLICY "authenticated_all_erp_task_attachments" ON public.erp_task_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_spectators" ON public.erp_task_spectators;
CREATE POLICY "authenticated_all_erp_task_spectators" ON public.erp_task_spectators
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_erp_task_templates" ON public.erp_task_templates;
CREATE POLICY "authenticated_all_erp_task_templates" ON public.erp_task_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);