
-- Ad action logs table for tracking all ad-related actions
CREATE TABLE public.ad_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  action_type TEXT NOT NULL,
  adv_no TEXT,
  ad_details JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ad_action_logs_created_at ON public.ad_action_logs (created_at DESC);
CREATE INDEX idx_ad_action_logs_action_type ON public.ad_action_logs (action_type);
CREATE INDEX idx_ad_action_logs_adv_no ON public.ad_action_logs (adv_no);

-- Enable RLS
ALTER TABLE public.ad_action_logs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated and anon users to read (terminal uses custom auth, not supabase auth)
CREATE POLICY "Anyone can read ad action logs"
  ON public.ad_action_logs FOR SELECT
  USING (true);

-- Allow inserts from anyone (terminal uses custom auth)
CREATE POLICY "Anyone can insert ad action logs"
  ON public.ad_action_logs FOR INSERT
  WITH CHECK (true);
