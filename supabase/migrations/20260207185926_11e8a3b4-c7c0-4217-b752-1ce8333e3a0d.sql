
-- Create leave allocation requests table
CREATE TABLE IF NOT EXISTS public.hr_leave_allocation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  requested_days NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested',
  description TEXT,
  comment TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_leave_allocation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to leave allocation requests"
  ON public.hr_leave_allocation_requests FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_hr_leave_allocation_requests_updated_at
  BEFORE UPDATE ON public.hr_leave_allocation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
