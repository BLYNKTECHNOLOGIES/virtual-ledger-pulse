ALTER TABLE public.p2p_release_deadline_monitor_log
ADD COLUMN IF NOT EXISTS notify_pay_time timestamptz,
ADD COLUMN IF NOT EXISTS complain_freeze_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_release_deadline_monitor_complain_freeze
ON public.p2p_release_deadline_monitor_log(complain_freeze_time DESC);

DROP POLICY IF EXISTS "authenticated_view_p2p_release_deadline_monitor_log" ON public.p2p_release_deadline_monitor_log;
DROP POLICY IF EXISTS "terminal_authorized_view_p2p_release_deadline_monitor_log" ON public.p2p_release_deadline_monitor_log;
CREATE POLICY "terminal_authorized_view_p2p_release_deadline_monitor_log"
ON public.p2p_release_deadline_monitor_log
FOR SELECT
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_orders_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_orders_manage')
  OR public.has_terminal_permission(auth.uid(), 'terminal_orders_chat')
  OR public.has_terminal_permission(auth.uid(), 'terminal_audit_logs_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_automation_manage')
);

DROP POLICY IF EXISTS "service_all_p2p_release_deadline_monitor_log" ON public.p2p_release_deadline_monitor_log;
CREATE POLICY "service_all_p2p_release_deadline_monitor_log"
ON public.p2p_release_deadline_monitor_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
