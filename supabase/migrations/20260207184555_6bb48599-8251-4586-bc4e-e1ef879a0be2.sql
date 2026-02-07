
-- Attendance tracking
CREATE TABLE public.hr_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  shift_id UUID,
  work_type VARCHAR(50) DEFAULT 'regular',
  attendance_status VARCHAR(20) DEFAULT 'present',
  overtime_hours NUMERIC(5,2) DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);

-- Leave types (Sick, Casual, Annual, etc.)
CREATE TABLE public.hr_leave_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT '#22c55e',
  max_days_per_year INTEGER DEFAULT 0,
  is_paid BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  carry_forward BOOLEAN DEFAULT false,
  max_carry_forward_days INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leave allocations per employee per year
CREATE TABLE public.hr_leave_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  allocated_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  carry_forward_days NUMERIC(5,1) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

-- Leave requests
CREATE TABLE public.hr_leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(5,1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'requested',
  reason TEXT,
  attachment_url TEXT,
  approved_by UUID REFERENCES public.hr_employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all for now, since this is an internal HR tool)
CREATE POLICY "Allow all access to hr_attendance" ON public.hr_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_leave_types" ON public.hr_leave_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_leave_allocations" ON public.hr_leave_allocations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to hr_leave_requests" ON public.hr_leave_requests FOR ALL USING (true) WITH CHECK (true);

-- Updated_at triggers
CREATE TRIGGER update_hr_attendance_updated_at BEFORE UPDATE ON public.hr_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_leave_types_updated_at BEFORE UPDATE ON public.hr_leave_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_leave_allocations_updated_at BEFORE UPDATE ON public.hr_leave_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hr_leave_requests_updated_at BEFORE UPDATE ON public.hr_leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default leave types
INSERT INTO public.hr_leave_types (name, code, color, max_days_per_year, is_paid, carry_forward) VALUES
  ('Casual Leave', 'CL', '#22c55e', 12, true, false),
  ('Sick Leave', 'SL', '#ef4444', 10, true, false),
  ('Annual Leave', 'AL', '#3b82f6', 15, true, true),
  ('Maternity Leave', 'ML', '#ec4899', 180, true, false),
  ('Paternity Leave', 'PL', '#8b5cf6', 15, true, false),
  ('Compensatory Off', 'CO', '#f59e0b', 0, true, false),
  ('Loss of Pay', 'LOP', '#6b7280', 0, false, false);
