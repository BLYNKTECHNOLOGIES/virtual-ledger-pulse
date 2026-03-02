
-- Biometric devices registry
CREATE TABLE IF NOT EXISTS public.hr_biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL,
  device_ip TEXT,
  device_port INTEGER DEFAULT 4370,
  device_serial TEXT,
  device_model TEXT DEFAULT 'eSSL Eris',
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  last_heartbeat TIMESTAMPTZ,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Raw punch logs from biometric device
CREATE TABLE IF NOT EXISTS public.hr_attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id TEXT NOT NULL,
  employee_id TEXT,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type TEXT DEFAULT 'auto',
  device_name TEXT,
  device_serial TEXT,
  raw_status INTEGER,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_punches_badge_time ON public.hr_attendance_punches(badge_id, punch_time DESC);
CREATE INDEX IF NOT EXISTS idx_punches_employee_date ON public.hr_attendance_punches(employee_id, punch_time DESC);
CREATE INDEX IF NOT EXISTS idx_punches_created ON public.hr_attendance_punches(created_at DESC);

-- Daily attendance summary (computed from punches)
CREATE TABLE IF NOT EXISTS public.hr_attendance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  first_in TIMESTAMPTZ,
  last_out TIMESTAMPTZ,
  total_hours NUMERIC(5,2) DEFAULT 0,
  punch_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'half_day', 'late', 'on_leave')),
  is_late BOOLEAN DEFAULT false,
  late_by_minutes INTEGER DEFAULT 0,
  early_departure BOOLEAN DEFAULT false,
  early_by_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_emp_date ON public.hr_attendance_daily(employee_id, attendance_date DESC);

-- RLS policies - allow all for authenticated and service role
ALTER TABLE public.hr_biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.hr_biometric_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.hr_attendance_punches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.hr_attendance_daily FOR ALL USING (true) WITH CHECK (true);
