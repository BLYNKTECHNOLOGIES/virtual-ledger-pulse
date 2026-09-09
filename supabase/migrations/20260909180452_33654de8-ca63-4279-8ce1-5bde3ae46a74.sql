CREATE TABLE IF NOT EXISTS public.terminal_chat_send_locks (
  lock_key text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.terminal_chat_send_locks TO service_role;
ALTER TABLE public.terminal_chat_send_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_chat_send_lock(p_key text, p_ttl_seconds integer DEFAULT 25)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  INSERT INTO public.terminal_chat_send_locks(lock_key, locked_until)
  VALUES (p_key, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (lock_key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until, updated_at = now()
    WHERE public.terminal_chat_send_locks.locked_until < now()
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_chat_send_lock(p_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.terminal_chat_send_locks SET locked_until = now() - interval '1 second', updated_at = now()
  WHERE lock_key = p_key;
$$;

REVOKE EXECUTE ON FUNCTION public.acquire_chat_send_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_chat_send_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_chat_send_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_chat_send_lock(text) TO service_role;