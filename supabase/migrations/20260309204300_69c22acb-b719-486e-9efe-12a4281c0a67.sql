
-- =====================================================
-- Fix: Grant table permissions for presence & notifications
-- RLS policies exist but were useless without base GRANTs
-- =====================================================

-- Presence: users need INSERT, UPDATE, SELECT
GRANT SELECT, INSERT, UPDATE ON public.terminal_user_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.terminal_user_presence TO anon;

-- Notifications: users need full CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_notifications TO authenticated;

-- Also grant for service_role (used by server-side operations)
GRANT ALL ON public.terminal_user_presence TO service_role;
GRANT ALL ON public.terminal_notifications TO service_role;

-- Fix the RLS policies to be actually useful (restrict to own data)
-- Drop overly permissive policies and replace with proper ones

-- Presence: users can only upsert THEIR OWN presence
DROP POLICY IF EXISTS "Users can upsert own presence" ON public.terminal_user_presence;
CREATE POLICY "Users can upsert own presence" ON public.terminal_user_presence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own presence" ON public.terminal_user_presence;
CREATE POLICY "Users can update own presence" ON public.terminal_user_presence
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Presence: all authenticated can read all presence (needed for the alert hook)
-- Already exists: "Authenticated users can read presence"

-- Notifications: users can only read/update/delete THEIR OWN notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.terminal_notifications;
CREATE POLICY "Users can read own notifications" ON public.terminal_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.terminal_notifications;
CREATE POLICY "Users can update own notifications" ON public.terminal_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.terminal_notifications;
CREATE POLICY "Users can delete own notifications" ON public.terminal_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Notifications: any authenticated user can INSERT (alerts create for ancestors)
-- Already exists: "Authenticated can insert notifications"
