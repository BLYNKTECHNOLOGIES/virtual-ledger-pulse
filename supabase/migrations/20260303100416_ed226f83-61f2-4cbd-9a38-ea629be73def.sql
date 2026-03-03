
-- Create table for alternate UPI requests workflow
CREATE TABLE public.terminal_alternate_upi_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  updated_upi_id text,
  updated_upi_name text,
  updated_pay_method text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Index for fast lookups
CREATE INDEX idx_alt_upi_order_number ON public.terminal_alternate_upi_requests(order_number);
CREATE INDEX idx_alt_upi_status ON public.terminal_alternate_upi_requests(status);

-- Enable RLS
ALTER TABLE public.terminal_alternate_upi_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can select, insert, update
CREATE POLICY "Authenticated users can view alternate UPI requests"
  ON public.terminal_alternate_upi_requests
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create alternate UPI requests"
  ON public.terminal_alternate_upi_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update alternate UPI requests"
  ON public.terminal_alternate_upi_requests
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
