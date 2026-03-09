
-- RPC for sendBeacon offline marking (no auth context available in beacon)
CREATE OR REPLACE FUNCTION public.mark_terminal_user_offline(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE terminal_user_presence
  SET is_online = false, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_terminal_user_offline TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_terminal_user_offline TO anon;
