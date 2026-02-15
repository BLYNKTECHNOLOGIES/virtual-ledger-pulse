
-- Create shifts table
CREATE TABLE public.hr_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  break_duration_minutes INTEGER DEFAULT 60,
  is_night_shift BOOLEAN DEFAULT false,
  grace_period_minutes INTEGER DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_shifts" ON public.hr_shifts FOR ALL USING (true) WITH CHECK (true);

-- Create holidays table
CREATE TABLE public.hr_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  recurring BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_holidays" ON public.hr_holidays FOR ALL USING (true) WITH CHECK (true);

-- Add FK from hr_attendance to hr_shifts
ALTER TABLE public.hr_attendance
  ADD CONSTRAINT hr_attendance_shift_id_fkey
  FOREIGN KEY (shift_id) REFERENCES public.hr_shifts(id);
