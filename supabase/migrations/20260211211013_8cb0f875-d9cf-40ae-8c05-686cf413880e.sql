
-- Create erp_action_queue table for tracking unreconciled Binance asset movements
CREATE TABLE public.erp_action_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  movement_id text UNIQUE NOT NULL,
  movement_type text NOT NULL,
  asset text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  tx_id text,
  network text,
  wallet_id uuid REFERENCES public.wallets(id),
  movement_time bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  action_type text,
  erp_reference_id text,
  processed_by uuid,
  processed_at timestamptz,
  reject_reason text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.erp_action_queue ENABLE ROW LEVEL SECURITY;

-- Full access for authenticated users (internal ERP tool)
CREATE POLICY "Authenticated users can view erp_action_queue"
  ON public.erp_action_queue FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert erp_action_queue"
  ON public.erp_action_queue FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update erp_action_queue"
  ON public.erp_action_queue FOR UPDATE
  TO authenticated USING (true);

-- Also allow anon access since terminal uses custom auth (not Supabase auth)
CREATE POLICY "Anon can view erp_action_queue"
  ON public.erp_action_queue FOR SELECT
  TO anon USING (true);

CREATE POLICY "Anon can insert erp_action_queue"
  ON public.erp_action_queue FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Anon can update erp_action_queue"
  ON public.erp_action_queue FOR UPDATE
  TO anon USING (true);

-- Index on status for fast pending lookups
CREATE INDEX idx_erp_action_queue_status ON public.erp_action_queue(status);

-- Index on movement_type for filtering
CREATE INDEX idx_erp_action_queue_movement_type ON public.erp_action_queue(movement_type);
