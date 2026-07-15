
-- Command queue (already referenced by webhook)
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  command_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  ack_at timestamptz,
  ack_response text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bio_cmd_serial_status ON public.hr_biometric_device_commands(device_serial, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_commands TO authenticated;
GRANT ALL ON public.hr_biometric_device_commands TO service_role;
ALTER TABLE public.hr_biometric_device_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_cmd" ON public.hr_biometric_device_commands FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_bio_cmd" ON public.hr_biometric_device_commands FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enrolled user roster pushed from device (USER lines in OPERLOG)
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  pin text NOT NULL,
  name text,
  privilege int,          -- 0=user, 1=enroller, 2=admin, 3=super-admin, 14=custom
  password_set boolean DEFAULT false,
  card_no text,
  group_no int,
  time_zones text,        -- "TZ=1,0,0"
  verify_mode int,        -- FP/Face/Card/Password combo bitmask
  vice_card text,
  fp_count int DEFAULT 0,
  face_count int DEFAULT 0,
  palm_count int DEFAULT 0,
  vein_count int DEFAULT 0,
  photo_present boolean DEFAULT false,
  raw_line text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  matched_employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_serial, pin)
);
CREATE INDEX IF NOT EXISTS idx_bio_users_pin ON public.hr_biometric_device_users(pin);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_users TO authenticated;
GRANT ALL ON public.hr_biometric_device_users TO service_role;
ALTER TABLE public.hr_biometric_device_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_users" ON public.hr_biometric_device_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_write_bio_users" ON public.hr_biometric_device_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Biometric template metadata (FP, FACE, PALM, VEIN) — we store metadata only, not raw templates by default
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  pin text NOT NULL,
  template_kind text NOT NULL,  -- FP, FACE, PALM, VEIN, BIODATA
  finger_index int,             -- 0..9 for FP; 50 for FACE etc.
  size_bytes int,
  valid boolean,
  duress boolean,
  algorithm_version text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_serial, pin, template_kind, finger_index)
);
CREATE INDEX IF NOT EXISTS idx_bio_tpl_pin ON public.hr_biometric_device_templates(device_serial, pin);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_templates TO authenticated;
GRANT ALL ON public.hr_biometric_device_templates TO service_role;
ALTER TABLE public.hr_biometric_device_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_tpl" ON public.hr_biometric_device_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_write_bio_tpl" ON public.hr_biometric_device_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- User avatar photos (USERPIC)
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  pin text NOT NULL,
  kind text NOT NULL DEFAULT 'USERPIC',   -- USERPIC or ATTPHOTO
  size_bytes int,
  photo_base64 text,
  punch_time timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bio_photos_pin ON public.hr_biometric_device_photos(device_serial, pin);
CREATE INDEX IF NOT EXISTS idx_bio_photos_kind_time ON public.hr_biometric_device_photos(kind, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_photos TO authenticated;
GRANT ALL ON public.hr_biometric_device_photos TO service_role;
ALTER TABLE public.hr_biometric_device_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_photos" ON public.hr_biometric_device_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_write_bio_photos" ON public.hr_biometric_device_photos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Operator log: OPLOG entries — admin enrolls user, deletes user, factory reset, sign-in, etc.
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_operlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL,
  op_code int,
  op_label text,
  admin_pin text,
  target_pin text,
  occurred_at timestamptz,
  value_1 text,
  value_2 text,
  value_3 text,
  value_4 text,
  raw_line text,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bio_oplog_serial_time ON public.hr_biometric_device_operlog(device_serial, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_operlog TO authenticated;
GRANT ALL ON public.hr_biometric_device_operlog TO service_role;
ALTER TABLE public.hr_biometric_device_operlog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_oplog" ON public.hr_biometric_device_operlog FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_write_bio_oplog" ON public.hr_biometric_device_operlog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Device runtime info / capacity snapshot
CREATE TABLE IF NOT EXISTS public.hr_biometric_device_info (
  device_serial text PRIMARY KEY,
  firmware text,
  platform text,
  device_name text,
  oem_vendor text,
  mac_address text,
  ip_address text,
  push_version text,
  fp_algorithm_version text,
  face_algorithm_version text,
  user_count int,
  admin_count int,
  fp_count int,
  face_count int,
  palm_count int,
  password_count int,
  card_count int,
  transaction_count int,
  attphoto_count int,
  storage_used_pct int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_device_info TO authenticated;
GRANT ALL ON public.hr_biometric_device_info TO service_role;
ALTER TABLE public.hr_biometric_device_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_bio_info" ON public.hr_biometric_device_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc_write_bio_info" ON public.hr_biometric_device_info FOR ALL TO service_role USING (true) WITH CHECK (true);
