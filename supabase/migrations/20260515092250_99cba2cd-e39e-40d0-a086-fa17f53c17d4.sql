-- 1. Drop the unused super-admin impersonation RPC (frontend no longer calls it)
DROP FUNCTION IF EXISTS public.try_super_admin_impersonation(text, text);

-- 2. Lock down terminal_webauthn_challenges: remove anon ALL policy, and scope authenticated access
DROP POLICY IF EXISTS "anon_all_terminal_webauthn_challenges" ON public.terminal_webauthn_challenges;
DROP POLICY IF EXISTS "authenticated_all_terminal_webauthn_challenges" ON public.terminal_webauthn_challenges;

-- Only the owning user may read/manipulate their own challenge rows; the edge function
-- uses the service_role key which bypasses RLS automatically.
CREATE POLICY "users_manage_own_webauthn_challenges"
ON public.terminal_webauthn_challenges
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 3. Restrict column-level access on public.users so authenticated users cannot read sensitive columns.
-- Keep table-level SELECT for the login/has_role helpers but revoke sensitive columns from clients.
REVOKE SELECT (password_hash, email, phone) ON public.users FROM authenticated, anon;
-- service_role retains full access (used by edge functions and SECURITY DEFINER RPCs).
