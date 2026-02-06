
-- Table to store daily total asset value snapshots
CREATE TABLE public.asset_value_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  total_asset_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asset_value_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can view asset value history"
ON public.asset_value_history
FOR SELECT
TO authenticated
USING (true);

-- Only service role / functions can insert
CREATE POLICY "Service role can insert asset value history"
ON public.asset_value_history
FOR INSERT
TO service_role
WITH CHECK (true);

-- Index on date for efficient range queries
CREATE INDEX idx_asset_value_history_date ON public.asset_value_history (snapshot_date DESC);
