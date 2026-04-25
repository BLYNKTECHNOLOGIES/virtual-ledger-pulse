ALTER TABLE public.p2p_auto_pay_log
ADD COLUMN IF NOT EXISTS notify_pay_time timestamptz,
ADD COLUMN IF NOT EXISTS confirm_pay_end_time timestamptz,
ADD COLUMN IF NOT EXISTS complain_freeze_time timestamptz,
ADD COLUMN IF NOT EXISTS mark_paid_order_status text;

CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_log_confirm_pay_end_time
ON public.p2p_auto_pay_log(confirm_pay_end_time);

CREATE INDEX IF NOT EXISTS idx_p2p_auto_pay_log_success_confirm_deadline
ON public.p2p_auto_pay_log(confirm_pay_end_time, order_number)
WHERE status IN ('success', 'unverified_success') AND confirm_pay_end_time IS NOT NULL;

UPDATE public.p2p_auto_pay_log
SET
  notify_pay_time = CASE
    WHEN metadata->'markPaidResult'->'data'->>'notifyPayTime' IS NOT NULL
      THEN to_timestamp((metadata->'markPaidResult'->'data'->>'notifyPayTime')::double precision / 1000)
    ELSE notify_pay_time
  END,
  confirm_pay_end_time = CASE
    WHEN metadata->'markPaidResult'->'data'->>'confirmPayEndTime' IS NOT NULL
      THEN to_timestamp((metadata->'markPaidResult'->'data'->>'confirmPayEndTime')::double precision / 1000)
    ELSE confirm_pay_end_time
  END,
  complain_freeze_time = CASE
    WHEN metadata->'markPaidResult'->'data'->>'complainFreezeTime' IS NOT NULL
      THEN to_timestamp((metadata->'markPaidResult'->'data'->>'complainFreezeTime')::double precision / 1000)
    ELSE complain_freeze_time
  END,
  mark_paid_order_status = COALESCE(metadata->'markPaidResult'->'data'->>'orderStatus', mark_paid_order_status)
WHERE metadata ? 'markPaidResult';

CREATE TABLE IF NOT EXISTS public.p2p_release_deadline_monitor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  auto_pay_log_id uuid REFERENCES public.p2p_auto_pay_log(id) ON DELETE SET NULL,
  confirm_pay_end_time timestamptz NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  live_order_status text,
  status text NOT NULL,
  minutes_overdue numeric,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.p2p_release_deadline_monitor_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_view_p2p_release_deadline_monitor_log" ON public.p2p_release_deadline_monitor_log;
CREATE POLICY "authenticated_view_p2p_release_deadline_monitor_log"
ON public.p2p_release_deadline_monitor_log
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_release_deadline_monitor_order
ON public.p2p_release_deadline_monitor_log(order_number);

CREATE INDEX IF NOT EXISTS idx_release_deadline_monitor_checked_at
ON public.p2p_release_deadline_monitor_log(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_deadline_monitor_status
ON public.p2p_release_deadline_monitor_log(status);

CREATE INDEX IF NOT EXISTS idx_release_deadline_monitor_deadline
ON public.p2p_release_deadline_monitor_log(confirm_pay_end_time DESC);