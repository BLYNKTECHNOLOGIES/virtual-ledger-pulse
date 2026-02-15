
CREATE TABLE public.hr_biometric_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'ZKTeco / eSSL Biometric',
  machine_ip TEXT,
  port_no TEXT,
  password TEXT DEFAULT '0',
  device_direction TEXT NOT NULL DEFAULT 'System Direction(In/Out) Device',
  company TEXT,
  is_live_capture BOOLEAN NOT NULL DEFAULT false,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  employees_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_biometric_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to hr_biometric_devices" ON public.hr_biometric_devices FOR ALL USING (true) WITH CHECK (true);
