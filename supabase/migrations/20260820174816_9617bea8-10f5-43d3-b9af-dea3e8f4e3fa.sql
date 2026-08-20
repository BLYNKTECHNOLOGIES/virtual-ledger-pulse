CREATE OR REPLACE FUNCTION public.verify_erp_sync_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  RETURN public.verify_terminal_access(p_user_id)
      OR public.has_permission(p_user_id, 'sales_view'::app_permission)
      OR public.has_permission(p_user_id, 'purchase_view'::app_permission)
      OR public.has_permission(p_user_id, 'erp_entry_view'::app_permission);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_erp_sync_access(uuid) TO authenticated, service_role;

-- Sales sync
DROP POLICY IF EXISTS erp_sync_select_terminal_sales_sync ON public.terminal_sales_sync;
CREATE POLICY erp_sync_select_terminal_sales_sync ON public.terminal_sales_sync
  FOR SELECT TO authenticated USING (public.verify_erp_sync_access((SELECT auth.uid())));
DROP POLICY IF EXISTS erp_sync_write_terminal_sales_sync ON public.terminal_sales_sync;
CREATE POLICY erp_sync_write_terminal_sales_sync ON public.terminal_sales_sync
  FOR ALL TO authenticated USING (public.verify_erp_sync_access((SELECT auth.uid())))
  WITH CHECK (public.verify_erp_sync_access((SELECT auth.uid())));

-- Purchase sync
DROP POLICY IF EXISTS erp_sync_select_terminal_purchase_sync ON public.terminal_purchase_sync;
CREATE POLICY erp_sync_select_terminal_purchase_sync ON public.terminal_purchase_sync
  FOR SELECT TO authenticated USING (public.verify_erp_sync_access((SELECT auth.uid())));
DROP POLICY IF EXISTS erp_sync_write_terminal_purchase_sync ON public.terminal_purchase_sync;
CREATE POLICY erp_sync_write_terminal_purchase_sync ON public.terminal_purchase_sync
  FOR ALL TO authenticated USING (public.verify_erp_sync_access((SELECT auth.uid())))
  WITH CHECK (public.verify_erp_sync_access((SELECT auth.uid())));

-- Wallet links (read only for ERP staff)
DROP POLICY IF EXISTS erp_sync_select_terminal_wallet_links ON public.terminal_wallet_links;
CREATE POLICY erp_sync_select_terminal_wallet_links ON public.terminal_wallet_links
  FOR SELECT TO authenticated USING (public.verify_erp_sync_access((SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_sales_sync TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_purchase_sync TO authenticated;
GRANT SELECT ON public.terminal_wallet_links TO authenticated;