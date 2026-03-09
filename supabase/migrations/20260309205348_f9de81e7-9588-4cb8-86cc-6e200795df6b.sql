
-- Create RPC for presence heartbeat (bypasses RLS)
CREATE OR REPLACE FUNCTION public.terminal_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO terminal_user_presence (user_id, last_seen_at, is_online, updated_at)
  VALUES (auth.uid(), now(), true, now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(), is_online = true, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.terminal_heartbeat TO authenticated;
