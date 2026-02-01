-- Create system_action_logs table for universal audit trail
CREATE TABLE public.system_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  module TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate logs for same entity+action
CREATE UNIQUE INDEX idx_system_action_logs_entity_action 
ON public.system_action_logs(entity_id, action_type);

-- Create indexes for efficient querying
CREATE INDEX idx_system_action_logs_entity_id ON public.system_action_logs(entity_id);
CREATE INDEX idx_system_action_logs_entity_type ON public.system_action_logs(entity_type);
CREATE INDEX idx_system_action_logs_user_id ON public.system_action_logs(user_id);
CREATE INDEX idx_system_action_logs_module ON public.system_action_logs(module);
CREATE INDEX idx_system_action_logs_recorded_at ON public.system_action_logs(recorded_at DESC);

-- Enable Row Level Security
ALTER TABLE public.system_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow SELECT and INSERT only (logs are immutable)
CREATE POLICY "Allow reading action logs" 
ON public.system_action_logs 
FOR SELECT 
USING (true);

CREATE POLICY "Allow creating action logs" 
ON public.system_action_logs 
FOR INSERT 
WITH CHECK (true);

-- Note: No UPDATE or DELETE policies - logs are immutable