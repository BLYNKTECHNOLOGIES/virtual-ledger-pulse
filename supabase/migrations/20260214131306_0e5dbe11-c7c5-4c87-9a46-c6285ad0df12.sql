
-- Create a many-to-many mapping table for supervisors
CREATE TABLE public.terminal_user_supervisor_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  supervisor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, supervisor_id)
);

ALTER TABLE public.terminal_user_supervisor_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supervisor mappings"
  ON public.terminal_user_supervisor_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage supervisor mappings"
  ON public.terminal_user_supervisor_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrate existing data from reports_to column
INSERT INTO public.terminal_user_supervisor_mappings (user_id, supervisor_id)
SELECT user_id, reports_to FROM public.terminal_user_profiles WHERE reports_to IS NOT NULL
ON CONFLICT DO NOTHING;
