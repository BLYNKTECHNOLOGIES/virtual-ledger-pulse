DROP POLICY IF EXISTS authenticated_all_terminal_webauthn_credentials ON public.terminal_webauthn_credentials;

CREATE POLICY own_select_terminal_webauthn_credentials ON public.terminal_webauthn_credentials
FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY own_insert_terminal_webauthn_credentials ON public.terminal_webauthn_credentials
FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY own_update_terminal_webauthn_credentials ON public.terminal_webauthn_credentials
FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY own_delete_terminal_webauthn_credentials ON public.terminal_webauthn_credentials
FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS service_all_terminal_webauthn_credentials ON public.terminal_webauthn_credentials;
CREATE POLICY service_all_terminal_webauthn_credentials ON public.terminal_webauthn_credentials
FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_webauthn_credentials TO authenticated;
GRANT ALL ON public.terminal_webauthn_credentials TO service_role;