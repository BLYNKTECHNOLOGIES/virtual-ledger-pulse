DROP POLICY IF EXISTS "small_payment_cases_read" ON public.terminal_small_payment_cases;
CREATE POLICY "small_payment_cases_read"
ON public.terminal_small_payment_cases
FOR SELECT
TO authenticated
USING (
  payer_user_id = auth.uid()
  OR manager_user_id = auth.uid()
  OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
);

DROP POLICY IF EXISTS "small_payment_events_read" ON public.terminal_small_payment_case_events;
CREATE POLICY "small_payment_events_read"
ON public.terminal_small_payment_case_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.terminal_small_payment_cases c
    WHERE c.id = case_id
      AND (
        c.payer_user_id = auth.uid()
        OR c.manager_user_id = auth.uid()
        OR public.has_terminal_permission(auth.uid(), 'terminal_small_payments_manage')
        OR public.has_terminal_permission(auth.uid(), 'terminal_payer_view')
      )
  )
);