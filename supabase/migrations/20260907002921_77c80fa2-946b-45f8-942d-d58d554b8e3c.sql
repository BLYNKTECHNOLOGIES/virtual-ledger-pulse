CREATE TABLE IF NOT EXISTS public.terminal_active_orders_cache (
  exchange_account_id uuid NOT NULL,
  order_number text NOT NULL,
  raw jsonb NOT NULL,
  order_status text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_account_id, order_number)
);
GRANT SELECT ON public.terminal_active_orders_cache TO authenticated;
GRANT ALL ON public.terminal_active_orders_cache TO service_role;
ALTER TABLE public.terminal_active_orders_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read active orders cache" ON public.terminal_active_orders_cache;
CREATE POLICY "Authenticated users can read active orders cache" ON public.terminal_active_orders_cache
  FOR SELECT TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_active_orders_cache;

CREATE TABLE IF NOT EXISTS public.terminal_collector_state (
  id text PRIMARY KEY,
  last_tick_at timestamptz,
  last_status text NOT NULL DEFAULT 'starting',
  detail jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.terminal_collector_state TO authenticated;
GRANT ALL ON public.terminal_collector_state TO service_role;
ALTER TABLE public.terminal_collector_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read collector state" ON public.terminal_collector_state;
CREATE POLICY "Authenticated users can read collector state" ON public.terminal_collector_state
  FOR SELECT TO authenticated USING (true);