-- Add SLA, pinning, escalation columns to erp_tasks
ALTER TABLE public.erp_tasks
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_hours integer,
  ADD COLUMN IF NOT EXISTS escalation_user_id uuid REFERENCES public.users(id);