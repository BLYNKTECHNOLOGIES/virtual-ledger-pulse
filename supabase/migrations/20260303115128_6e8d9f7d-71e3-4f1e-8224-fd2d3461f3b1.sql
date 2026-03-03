
-- Operator Assignment table (mirrors terminal_payer_assignments)
CREATE TABLE public.terminal_operator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('size_range', 'ad_id')),
  size_range_id uuid REFERENCES public.terminal_order_size_ranges(id) ON DELETE CASCADE,
  ad_id text,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: public access (custom auth uses localStorage, not auth.uid())
ALTER TABLE public.terminal_operator_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to terminal_operator_assignments"
  ON public.terminal_operator_assignments
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
