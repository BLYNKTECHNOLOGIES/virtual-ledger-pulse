ALTER TABLE public.binance_order_history
  ADD COLUMN IF NOT EXISTS complaint_status text;

ALTER TABLE public.binance_order_history
  ADD COLUMN IF NOT EXISTS has_active_complaint boolean DEFAULT false;

UPDATE public.binance_order_history
SET has_active_complaint = false
WHERE has_active_complaint IS NULL;

ALTER TABLE public.binance_order_history
  ALTER COLUMN has_active_complaint SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_binance_order_history_active_complaint
  ON public.binance_order_history (has_active_complaint)
  WHERE has_active_complaint = true;

UPDATE public.binance_order_history
SET
  complaint_status = COALESCE(
    raw_data->>'complaintStatus',
    raw_data->>'complainStatus',
    raw_data->>'appealStatus'
  ),
  has_active_complaint = (
    (
      COALESCE(raw_data->>'complaintStatus', raw_data->>'complainStatus', raw_data->>'appealStatus') IS NOT NULL
      AND COALESCE(raw_data->>'complaintStatus', raw_data->>'complainStatus', raw_data->>'appealStatus') <> ''
      AND UPPER(COALESCE(raw_data->>'complaintStatus', raw_data->>'complainStatus', raw_data->>'appealStatus')) NOT IN ('0','3','CLOSED','RESOLVED','CANCELLED','CANCELED')
    )
    OR (raw_data->>'canCancelComplaintOrder')::text = 'true'
    OR UPPER(COALESCE(order_status, '')) LIKE '%APPEAL%'
    OR UPPER(COALESCE(order_status, '')) LIKE '%DISPUTE%'
    OR UPPER(COALESCE(order_status, '')) LIKE '%COMPLAINT%'
  )
WHERE raw_data IS NOT NULL;