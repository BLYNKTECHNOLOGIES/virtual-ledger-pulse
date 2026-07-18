
-- Phase 0: Attendance Engine v4 groundwork (additive; no behavior change)

-- 0.1 Suppression flags on raw punches (immutable; suppression = classification, not deletion)
ALTER TABLE public.hr_attendance_punches
  ADD COLUMN IF NOT EXISTS effective boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS suppressed_reason text;

CREATE INDEX IF NOT EXISTS idx_hr_attendance_punches_effective
  ON public.hr_attendance_punches (employee_id, punch_time)
  WHERE effective = true;

-- 0.2 Session rollup table (paired IN→OUT closures per 05:00-IST window-date)
CREATE TABLE IF NOT EXISTS public.hr_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  attendance_date date NOT NULL,           -- 05:00-IST window-date; anchor = IN's window
  session_no int NOT NULL,                 -- 1-based within the window-date
  in_punch_id uuid NOT NULL REFERENCES public.hr_attendance_punches(id) ON DELETE CASCADE,
  out_punch_id uuid REFERENCES public.hr_attendance_punches(id) ON DELETE SET NULL,
  in_time timestamptz NOT NULL,
  out_time timestamptz,
  minutes integer,                         -- NULL while session is open
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date, session_no),
  UNIQUE (in_punch_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_sessions_emp_date
  ON public.hr_attendance_sessions (employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_sessions_open
  ON public.hr_attendance_sessions (employee_id)
  WHERE out_punch_id IS NULL;

GRANT SELECT ON public.hr_attendance_sessions TO authenticated;
GRANT ALL ON public.hr_attendance_sessions TO service_role;
ALTER TABLE public.hr_attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_attendance_sessions read for authenticated"
  ON public.hr_attendance_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr_attendance_sessions service_role all"
  ON public.hr_attendance_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_hr_attendance_sessions_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_hr_attendance_sessions_touch ON public.hr_attendance_sessions;
CREATE TRIGGER trg_hr_attendance_sessions_touch
  BEFORE UPDATE ON public.hr_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_attendance_sessions_touch();

-- 0.3 Global tunables singleton for the v4 engine (admin-editable; seeded defaults)
CREATE TABLE IF NOT EXISTS public.hr_attendance_engine_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  debounce_seconds integer NOT NULL DEFAULT 15,
  day_cutoff_ist time NOT NULL DEFAULT '05:00',
  lunch_window_start_ist time NOT NULL DEFAULT '12:00',
  lunch_window_end_ist time NOT NULL DEFAULT '15:00',
  watchdog_hours integer NOT NULL DEFAULT 12,
  grace_late_minutes integer NOT NULL DEFAULT 10,
  half_day_net_hours numeric(4,2) NOT NULL DEFAULT 4.5,
  ot_daily_hours numeric(4,2) NOT NULL DEFAULT 9.0,       -- fallback when detected-shift length unavailable
  clock_drift_alert_seconds integer NOT NULL DEFAULT 30,
  shift_match_tolerance_hours integer NOT NULL DEFAULT 3,
  punch_retention_years integer NOT NULL DEFAULT 3,
  two_device_cutover_utc timestamptz NOT NULL DEFAULT '2026-07-17T13:45:00Z',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.hr_attendance_engine_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.hr_attendance_engine_settings TO authenticated;
GRANT ALL ON public.hr_attendance_engine_settings TO service_role;
ALTER TABLE public.hr_attendance_engine_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_settings read for authenticated"
  ON public.hr_attendance_engine_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "engine_settings write for service_role"
  ON public.hr_attendance_engine_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_hr_engine_settings_touch ON public.hr_attendance_engine_settings;
CREATE TRIGGER trg_hr_engine_settings_touch
  BEFORE UPDATE ON public.hr_attendance_engine_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_attendance_sessions_touch();

COMMENT ON TABLE public.hr_attendance_sessions IS
  'Attendance Engine v4 — paired IN→OUT sessions; attendance_date anchored to 05:00-IST window of the IN punch.';
COMMENT ON COLUMN public.hr_attendance_punches.effective IS
  'v4 engine: false when this punch was suppressed by classification (debounce/redundant_in/orphan_out). Never deleted.';
COMMENT ON COLUMN public.hr_attendance_punches.suppressed_reason IS
  'v4 engine reason code: debounce | redundant_in | orphan_out | null.';
