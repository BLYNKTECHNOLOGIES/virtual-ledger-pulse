-- AM-SEC-3: only the server (binance-ads, service role) creates rest-timer rows.
DROP POLICY IF EXISTS terminal_insert_ad_rest_timer ON public.ad_rest_timer;

-- AM-SEC-2: only the auto-pricing right may exclude/include ads; Terminal users keep reading.
DROP POLICY IF EXISTS authenticated_all_ad_automation_exclusions ON public.ad_automation_exclusions;
CREATE POLICY terminal_select_ad_automation_exclusions ON public.ad_automation_exclusions
  FOR SELECT TO authenticated
  USING (public.verify_terminal_access((SELECT auth.uid())));
CREATE POLICY terminal_insert_ad_automation_exclusions ON public.ad_automation_exclusions
  FOR INSERT TO authenticated
  WITH CHECK ('terminal_pricing_manage' IN (SELECT public.get_terminal_permissions((SELECT auth.uid()))));
CREATE POLICY terminal_update_ad_automation_exclusions ON public.ad_automation_exclusions
  FOR UPDATE TO authenticated
  USING ('terminal_pricing_manage' IN (SELECT public.get_terminal_permissions((SELECT auth.uid()))))
  WITH CHECK ('terminal_pricing_manage' IN (SELECT public.get_terminal_permissions((SELECT auth.uid()))));
CREATE POLICY terminal_delete_ad_automation_exclusions ON public.ad_automation_exclusions
  FOR DELETE TO authenticated
  USING ('terminal_pricing_manage' IN (SELECT public.get_terminal_permissions((SELECT auth.uid()))));