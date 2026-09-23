
-- ============ Phase 1: device trust groundwork ============

ALTER TABLE public.terminal_webauthn_credentials
  ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'view_only',
  ADD COLUMN IF NOT EXISTS enrolled_ip text,
  ADD COLUMN IF NOT EXISTS enrolled_via text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terminal_webauthn_credentials_trust_level_chk'
  ) THEN
    ALTER TABLE public.terminal_webauthn_credentials
      ADD CONSTRAINT terminal_webauthn_credentials_trust_level_chk
      CHECK (trust_level IN ('office','view_only'));
  END IF;
END $$;

-- Existing devices are office machines: keep today's behaviour intact.
UPDATE public.terminal_webauthn_credentials
SET trust_level = 'office', enrolled_via = COALESCE(enrolled_via, 'legacy_backfill')
WHERE trust_level = 'view_only' AND created_at < now();

ALTER TABLE public.terminal_biometric_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS credential_id text,
  ADD COLUMN IF NOT EXISTS client_ip text,
  ADD COLUMN IF NOT EXISTS enforced_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terminal_biometric_sessions_mode_chk'
  ) THEN
    ALTER TABLE public.terminal_biometric_sessions
      ADD CONSTRAINT terminal_biometric_sessions_mode_chk
      CHECK (mode IN ('full','view_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_terminal_biometric_sessions_user_auth_at
  ON public.terminal_biometric_sessions (user_id, authenticated_at DESC);

-- ---------- trusted office networks ----------
CREATE TABLE IF NOT EXISTS public.terminal_trusted_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  cidr text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.terminal_trusted_networks TO authenticated;
GRANT ALL ON public.terminal_trusted_networks TO service_role;
ALTER TABLE public.terminal_trusted_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trusted networks readable by terminal staff" ON public.terminal_trusted_networks;
CREATE POLICY "trusted networks readable by terminal staff"
  ON public.terminal_trusted_networks FOR SELECT TO authenticated
  USING (public.has_terminal_access(auth.uid()));
DROP POLICY IF EXISTS "trusted networks managed by super admin" ON public.terminal_trusted_networks;
CREATE POLICY "trusted networks managed by super admin"
  ON public.terminal_trusted_networks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Super Admin'))
  WITH CHECK (public.has_role(auth.uid(), 'Super Admin'));

-- ---------- one-time office enrolment codes ----------
CREATE TABLE IF NOT EXISTS public.terminal_device_enrolment_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  issued_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  consumed_credential_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_terminal_device_enrolment_codes_user
  ON public.terminal_device_enrolment_codes (user_id, consumed_at, expires_at);
GRANT ALL ON public.terminal_device_enrolment_codes TO service_role;
ALTER TABLE public.terminal_device_enrolment_codes ENABLE ROW LEVEL SECURITY;
-- No authenticated grants: codes are only ever handled server-side.

-- ---------- safe-list of writes permitted in view-only mode ----------
CREATE TABLE IF NOT EXISTS public.terminal_view_only_write_allowlist (
  table_name text PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.terminal_view_only_write_allowlist TO authenticated;
GRANT ALL ON public.terminal_view_only_write_allowlist TO service_role;
ALTER TABLE public.terminal_view_only_write_allowlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allowlist readable" ON public.terminal_view_only_write_allowlist;
CREATE POLICY "allowlist readable" ON public.terminal_view_only_write_allowlist
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.terminal_view_only_write_allowlist (table_name, reason) VALUES
  ('terminal_user_presence', 'presence heartbeat'),
  ('terminal_binance_chat_reads', 'chat read markers'),
  ('terminal_internal_chat_reads', 'chat read markers'),
  ('terminal_activity_log', 'audit trail'),
  ('terminal_biometric_sessions', 'session lifecycle'),
  ('terminal_webauthn_credentials', 'device registration'),
  ('terminal_webauthn_challenges', 'device registration'),
  ('terminal_device_enrolment_codes', 'device registration'),
  ('terminal_view_only_denials', 'audit trail'),
  ('terminal_bypass_codes', 'unlock lifecycle'),
  ('terminal_notifications', 'notification read state')
ON CONFLICT (table_name) DO NOTHING;

-- ---------- refusal audit ----------
CREATE TABLE IF NOT EXISTS public.terminal_view_only_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_mode text,
  object_name text,
  operation text,
  enforcement_mode text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_terminal_view_only_denials_created
  ON public.terminal_view_only_denials (created_at DESC);
GRANT SELECT ON public.terminal_view_only_denials TO authenticated;
GRANT ALL ON public.terminal_view_only_denials TO service_role;
ALTER TABLE public.terminal_view_only_denials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "denials readable by admins" ON public.terminal_view_only_denials;
CREATE POLICY "denials readable by admins" ON public.terminal_view_only_denials
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'Super Admin') OR public.has_terminal_permission(auth.uid(), 'terminal_users_view'));

-- ---------- guard settings ----------
CREATE TABLE IF NOT EXISTS public.terminal_device_guard_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enforcement_mode text NOT NULL DEFAULT 'log_only',
  require_office_network boolean NOT NULL DEFAULT true,
  view_only_lookback_hours integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_device_guard_settings_single CHECK (id),
  CONSTRAINT terminal_device_guard_settings_mode_chk CHECK (enforcement_mode IN ('off','log_only','enforce'))
);
GRANT SELECT ON public.terminal_device_guard_settings TO authenticated;
GRANT ALL ON public.terminal_device_guard_settings TO service_role;
ALTER TABLE public.terminal_device_guard_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guard settings readable" ON public.terminal_device_guard_settings;
CREATE POLICY "guard settings readable" ON public.terminal_device_guard_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "guard settings managed by super admin" ON public.terminal_device_guard_settings;
CREATE POLICY "guard settings managed by super admin" ON public.terminal_device_guard_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'Super Admin'))
  WITH CHECK (public.has_role(auth.uid(), 'Super Admin'));

INSERT INTO public.terminal_device_guard_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.terminal_view_only_write_allowlist (table_name, reason)
VALUES ('terminal_device_guard_settings','settings'),('terminal_trusted_networks','settings')
ON CONFLICT (table_name) DO NOTHING;

-- ---------- session mode resolution ----------
-- The mode of the user's most recent terminal unlock, within the lookback
-- window. A user with no recent terminal session is unaffected ('full'),
-- so ERP/HRMS work and automation behave exactly as before.
CREATE OR REPLACE FUNCTION public.terminal_session_mode(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT s.mode
      FROM public.terminal_biometric_sessions s
      WHERE s.user_id = p_user_id
        AND s.authenticated_at > now() - make_interval(hours => (
              SELECT view_only_lookback_hours FROM public.terminal_device_guard_settings WHERE id
            ))
      ORDER BY s.authenticated_at DESC
      LIMIT 1
    ), 'full');
$$;

CREATE OR REPLACE FUNCTION public.terminal_write_allowed(p_user_id uuid, p_object_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_user_id IS NULL
    OR (SELECT enforcement_mode FROM public.terminal_device_guard_settings WHERE id) = 'off'
    OR public.terminal_session_mode(p_user_id) <> 'view_only'
    OR (p_object_name IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.terminal_view_only_write_allowlist a WHERE a.table_name = p_object_name
       ));
$$;

GRANT EXECUTE ON FUNCTION public.terminal_session_mode(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_write_allowed(uuid, text) TO authenticated, service_role;
