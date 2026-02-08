-- Track which auto-reply triggers have already fired per order to prevent duplicates
CREATE TABLE IF NOT EXISTS public.p2p_auto_reply_processed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  trigger_event text NOT NULL,
  rule_id uuid REFERENCES public.p2p_auto_reply_rules(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_number, trigger_event, rule_id)
);

ALTER TABLE public.p2p_auto_reply_processed ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read processed records
CREATE POLICY "Authenticated users can read processed records"
  ON public.p2p_auto_reply_processed FOR SELECT TO authenticated USING (true);

-- Allow service role (edge function) to insert - edge functions use service role
CREATE POLICY "Service role can insert processed records"
  ON public.p2p_auto_reply_processed FOR INSERT WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_auto_reply_processed_order ON public.p2p_auto_reply_processed(order_number, trigger_event);

-- Enable pg_cron and pg_net for scheduled execution
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
