-- Quarantine table for punches whose device PIN has no employee mapping yet.
CREATE TABLE IF NOT EXISTS public.hr_attendance_quarantine (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_serial TEXT NOT NULL,
  pin TEXT NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type TEXT,
  raw_status INTEGER,
  verify_type INTEGER,
  work_code TEXT,
  raw_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at TIMESTAMPTZ,
  replayed_punch_id UUID,
  UNIQUE (device_serial, pin, punch_time)
);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_quarantine_lookup
  ON public.hr_attendance_quarantine (device_serial, pin) WHERE replayed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_quarantine_pending
  ON public.hr_attendance_quarantine (created_at DESC) WHERE replayed_at IS NULL;

GRANT SELECT ON public.hr_attendance_quarantine TO authenticated;
GRANT ALL ON public.hr_attendance_quarantine TO service_role;
ALTER TABLE public.hr_attendance_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view quarantine"
  ON public.hr_attendance_quarantine FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role writes quarantine"
  ON public.hr_attendance_quarantine FOR ALL TO service_role USING (true) WITH CHECK (true);

-- When a device PIN gets mapped to an employee, replay parked punches and
-- queue an ATTLOG re-query on the device so any punches we never even saw
-- (backlog beyond our push window) get re-pushed by the terminal.
CREATE OR REPLACE FUNCTION public.hr_replay_quarantine_on_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q RECORD;
  new_punch_id UUID;
  emp_badge TEXT;
  replayed INT := 0;
BEGIN
  IF NEW.matched_employee_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.matched_employee_id IS NOT DISTINCT FROM NEW.matched_employee_id THEN RETURN NEW; END IF;

  SELECT badge_id INTO emp_badge FROM public.hr_employees WHERE id = NEW.matched_employee_id;

  FOR q IN
    SELECT * FROM public.hr_attendance_quarantine
    WHERE device_serial = NEW.device_serial
      AND pin = NEW.pin
      AND replayed_at IS NULL
    ORDER BY punch_time ASC
  LOOP
    INSERT INTO public.hr_attendance_punches (
      badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status
    ) VALUES (
      COALESCE(emp_badge, q.pin), NEW.matched_employee_id, q.punch_time,
      COALESCE(q.punch_type, 'in'), 'eSSL Push (replayed)', q.device_serial, q.raw_status
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_punch_id;

    UPDATE public.hr_attendance_quarantine
       SET replayed_at = now(), replayed_punch_id = new_punch_id
     WHERE id = q.id;
    replayed := replayed + 1;
  END LOOP;

  -- Queue a full ATTLOG re-query on the device so backlog beyond push
  -- retention comes back through the normal ingest path.
  INSERT INTO public.hr_biometric_device_commands (
    device_serial, command, command_type, status, created_at
  ) VALUES (
    NEW.device_serial,
    'DATA QUERY ATTLOG StartTime=' || to_char((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '30 days', 'YYYY-MM-DD HH24:MI:SS')
      || ' EndTime=' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    'DATA_QUERY_ATTLOG',
    'queued',
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_replay_quarantine ON public.hr_biometric_device_users;
CREATE TRIGGER trg_hr_replay_quarantine
AFTER UPDATE OF matched_employee_id ON public.hr_biometric_device_users
FOR EACH ROW EXECUTE FUNCTION public.hr_replay_quarantine_on_mapping();

-- Accumulated silence-alarm counter columns (add if missing).
ALTER TABLE public.hr_biometric_devices
  ADD COLUMN IF NOT EXISTS unmatched_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unmatched_pin_count_total BIGINT NOT NULL DEFAULT 0;