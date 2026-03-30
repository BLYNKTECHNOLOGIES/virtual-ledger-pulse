-- ============================================================
-- Phase 21: Security hardening — drop public/anon policies,
-- restrict pending_registrations, secure terminal tables
-- ============================================================

-- P21-SEC-03: Drop anon WebAuthn credentials policy
DROP POLICY IF EXISTS "anon_read_terminal_webauthn_credentials" ON public.terminal_webauthn_credentials;

-- P21-SEC-04: Replace open pending_registrations with permission-gated access
DROP POLICY IF EXISTS "authenticated_all_pending_registrations" ON public.pending_registrations;

CREATE POLICY "manage_pending_registrations"
ON public.pending_registrations
FOR ALL
TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));

-- P21-SEC-05: Drop all {public} SELECT policies on terminal/ERP tables
DROP POLICY IF EXISTS "Allow reading terminal roles" ON public.p2p_terminal_roles;
DROP POLICY IF EXISTS "Allow reading terminal role permissions" ON public.p2p_terminal_role_permissions;
DROP POLICY IF EXISTS "Allow reading terminal user role assignments" ON public.p2p_terminal_user_roles;
DROP POLICY IF EXISTS "Terminal order assignments readable" ON public.terminal_order_assignments;
DROP POLICY IF EXISTS "Terminal user profiles are readable by authenticated" ON public.terminal_user_profiles;
DROP POLICY IF EXISTS "Supervisor mappings readable" ON public.terminal_user_supervisor_mappings;
DROP POLICY IF EXISTS "User size range mappings readable" ON public.terminal_user_size_range_mappings;
DROP POLICY IF EXISTS "User exchange mappings readable" ON public.terminal_user_exchange_mappings;
DROP POLICY IF EXISTS "Exchange accounts readable by all" ON public.terminal_exchange_accounts;
DROP POLICY IF EXISTS "Size ranges readable" ON public.terminal_order_size_ranges;
DROP POLICY IF EXISTS "App can view terminal wallet links" ON public.terminal_wallet_links;
DROP POLICY IF EXISTS "Users can view stock transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "anon_read_role_permissions" ON public.role_permissions;

-- Add authenticated SELECT for tables that don't already have it
CREATE POLICY "authenticated_read_terminal_roles"
ON public.p2p_terminal_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_terminal_role_permissions"
ON public.p2p_terminal_role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_terminal_user_roles"
ON public.p2p_terminal_user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_stock_transactions"
ON public.stock_transactions FOR SELECT TO authenticated USING (true);