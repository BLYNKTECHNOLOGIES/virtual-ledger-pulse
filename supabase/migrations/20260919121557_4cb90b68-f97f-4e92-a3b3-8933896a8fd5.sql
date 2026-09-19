GRANT SELECT, INSERT, UPDATE, DELETE ON public.subsidiaries TO authenticated;
GRANT ALL ON public.subsidiaries TO service_role;

CREATE POLICY "banking_staff_view_subsidiaries"
ON public.subsidiaries FOR SELECT TO authenticated
USING (public.can_view_banking(auth.uid()) OR public.can_manage_banking(auth.uid()));