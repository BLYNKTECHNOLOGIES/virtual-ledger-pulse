ALTER TABLE public.binance_order_history
ADD COLUMN IF NOT EXISTS cancel_reason_code integer,
ADD COLUMN IF NOT EXISTS cancel_reason_label text,
ADD COLUMN IF NOT EXISTS cancel_reason_additional text,
ADD COLUMN IF NOT EXISTS cancel_reason_source text,
ADD COLUMN IF NOT EXISTS cancel_reason_captured_at timestamptz;

ALTER TABLE public.p2p_order_records
ADD COLUMN IF NOT EXISTS cancel_reason_code integer,
ADD COLUMN IF NOT EXISTS cancel_reason_label text,
ADD COLUMN IF NOT EXISTS cancel_reason_additional text,
ADD COLUMN IF NOT EXISTS cancel_reason_source text,
ADD COLUMN IF NOT EXISTS cancel_reason_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_binance_order_history_cancel_reason
ON public.binance_order_history(cancel_reason_code, cancel_reason_captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_p2p_order_records_cancel_reason
ON public.p2p_order_records(cancel_reason_code, cancel_reason_captured_at DESC);

CREATE OR REPLACE FUNCTION public.decode_binance_cancel_reason(_code integer, _fallback text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _code
    WHEN 4 THEN 'Seller payment method issue'
    WHEN 5 THEN 'Other'
    ELSE COALESCE(_fallback, CASE WHEN _code IS NULL THEN NULL ELSE 'Unknown Binance cancel reason ' || _code::text END)
  END;
$$;

CREATE OR REPLACE FUNCTION public.flag_counterparty_for_payment_method_cancellations(_nickname text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_reason text;
BEGIN
  IF _nickname IS NULL OR btrim(_nickname) = '' THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.p2p_order_records
  WHERE counterparty_nickname = _nickname
    AND trade_type = 'BUY'
    AND cancel_reason_code = 4
    AND cancel_reason_captured_at >= now() - interval '30 days';

  IF v_count >= 2 THEN
    v_reason := 'Repeated seller payment method issue cancellations: ' || v_count::text || ' in 30 days';
    UPDATE public.p2p_counterparties
    SET is_flagged = true,
        flag_reason = CASE
          WHEN flag_reason IS NULL OR flag_reason = '' THEN v_reason
          WHEN position(v_reason in flag_reason) > 0 THEN flag_reason
          ELSE flag_reason || '; ' || v_reason
        END,
        updated_at = now()
    WHERE binance_nickname = _nickname;
  END IF;
END;
$$;
