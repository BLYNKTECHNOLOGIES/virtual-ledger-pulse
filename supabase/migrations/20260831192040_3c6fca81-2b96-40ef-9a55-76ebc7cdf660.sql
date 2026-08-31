
DROP POLICY IF EXISTS "wallet_tx_insert_privileged" ON public.wallet_transactions;
CREATE POLICY "wallet_tx_insert_privileged"
ON public.wallet_transactions FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_orders(auth.uid())
  OR public.can_manage_banking(auth.uid())
  OR public.has_permission(auth.uid(), 'stock_manage'::app_permission)
  OR public.has_permission(auth.uid(), 'manage_stock'::app_permission)
  OR public.has_permission(auth.uid(), 'stock_conversion_create'::app_permission)
);
