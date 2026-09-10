DROP POLICY IF EXISTS clients_select_scoped ON public.clients;
CREATE POLICY clients_select_scoped ON public.clients
  FOR SELECT
  USING ((SELECT public.can_access_client_kyc(auth.uid()) OR public.can_view_orders(auth.uid())));

DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
CREATE POLICY clients_update_scoped ON public.clients
  FOR UPDATE
  USING ((SELECT public.can_manage_clients(auth.uid())))
  WITH CHECK ((SELECT public.can_manage_clients(auth.uid())));

DROP POLICY IF EXISTS clients_insert_scoped ON public.clients;
CREATE POLICY clients_insert_scoped ON public.clients
  FOR INSERT
  WITH CHECK ((SELECT public.can_manage_clients(auth.uid())));

DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;
CREATE POLICY clients_delete_scoped ON public.clients
  FOR DELETE
  USING ((SELECT public.is_manager(auth.uid()) OR public.has_permission(auth.uid(), 'clients_destructive'::app_permission)));