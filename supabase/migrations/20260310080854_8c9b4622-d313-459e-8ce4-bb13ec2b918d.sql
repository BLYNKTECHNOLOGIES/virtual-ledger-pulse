
-- Persistent order-to-payer locks to prevent reassignment when payer config changes
CREATE TABLE public.terminal_payer_order_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  payer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'released')),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each order can only be locked to one payer at a time
CREATE UNIQUE INDEX idx_payer_order_locks_unique_active 
  ON public.terminal_payer_order_locks (order_number) 
  WHERE status = 'active';

-- Fast lookups by payer
CREATE INDEX idx_payer_order_locks_payer ON public.terminal_payer_order_locks (payer_user_id, status);

-- Fast lookups by order
CREATE INDEX idx_payer_order_locks_order ON public.terminal_payer_order_locks (order_number, status);

-- RLS
ALTER TABLE public.terminal_payer_order_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read locks"
  ON public.terminal_payer_order_locks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert locks"
  ON public.terminal_payer_order_locks FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update locks"
  ON public.terminal_payer_order_locks FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
