-- The app uses custom authentication (localStorage sessions), not Supabase Auth.
-- auth.uid() is always NULL, so the existing UPDATE policy silently fails.
-- Replace with permissive policies that allow operations.

DROP POLICY IF EXISTS "Allow authenticated users to update users" ON public.users;

CREATE POLICY "Allow users table updates"
  ON public.users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete users" ON public.users;

CREATE POLICY "Allow users table deletes"
  ON public.users
  FOR DELETE
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert users" ON public.users;

CREATE POLICY "Allow users table inserts"
  ON public.users
  FOR INSERT
  WITH CHECK (true);