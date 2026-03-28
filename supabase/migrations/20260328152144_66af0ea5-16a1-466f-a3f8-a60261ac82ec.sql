
-- Cleanup function for expired webauthn challenges and old automation logs
CREATE OR REPLACE FUNCTION public.cleanup_expired_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- I2: Remove expired webauthn challenges older than 1 day
  DELETE FROM public.terminal_webauthn_challenges
  WHERE expires_at < NOW() - INTERVAL '1 day';

  -- I3: Remove automation logs older than 30 days
  DELETE FROM public.p2p_auto_reply_log
  WHERE executed_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.p2p_auto_pay_log
  WHERE executed_at < NOW() - INTERVAL '30 days';
END;
$$;
