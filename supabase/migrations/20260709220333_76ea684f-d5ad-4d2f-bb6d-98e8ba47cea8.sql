CREATE TABLE public.order_nickname_registry (
  order_number text PRIMARY KEY,
  exchange_account_id uuid,
  cp_userno text,
  nickname text NOT NULL,
  verified_name text,
  trade_type text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 days')
);

CREATE INDEX idx_order_nickname_registry_nickname ON public.order_nickname_registry (nickname);
CREATE INDEX idx_order_nickname_registry_expires ON public.order_nickname_registry (expires_at);

GRANT SELECT ON public.order_nickname_registry TO authenticated;
GRANT ALL ON public.order_nickname_registry TO service_role;

ALTER TABLE public.order_nickname_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read nickname registry"
  ON public.order_nickname_registry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages nickname registry"
  ON public.order_nickname_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT cron.schedule(
  'cleanup-order-nickname-registry',
  '17 3 * * *',
  $$DELETE FROM public.order_nickname_registry WHERE expires_at < now()$$
);