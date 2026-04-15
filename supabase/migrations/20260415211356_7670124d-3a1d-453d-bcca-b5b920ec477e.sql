
-- Step 1: Create client_verified_names table
CREATE TABLE public.client_verified_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  verified_name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto_sync',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, verified_name)
);

-- Non-unique index on verified_name for fast lookups
CREATE INDEX idx_client_verified_names_name ON public.client_verified_names (verified_name);

-- Index on client_id for reverse lookups
CREATE INDEX idx_client_verified_names_client ON public.client_verified_names (client_id);

-- Enable RLS
ALTER TABLE public.client_verified_names ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view verified names"
  ON public.client_verified_names FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert verified names"
  ON public.client_verified_names FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update verified names"
  ON public.client_verified_names FOR UPDATE
  TO authenticated USING (true);

-- Step 2: Add index on p2p_order_records.counterparty_nickname
CREATE INDEX IF NOT EXISTS idx_p2p_order_records_nickname
  ON public.p2p_order_records (counterparty_nickname);
