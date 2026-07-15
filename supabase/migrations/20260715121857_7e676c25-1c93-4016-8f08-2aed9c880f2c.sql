
-- 1. raci_assignments: replace open public-read with authenticated-only read
DROP POLICY IF EXISTS "Public read access" ON public.raci_assignments;
CREATE POLICY "Authenticated read"
  ON public.raci_assignments FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.raci_assignments FROM anon;

-- 2. users.password_hash column: hide from authenticated (service role keeps full access)
REVOKE SELECT (password_hash) ON public.users FROM authenticated;
REVOKE SELECT (password_hash) ON public.users FROM anon;

-- 3. Revoke EXECUTE from anon on every SECURITY DEFINER function in public.
--    (authenticated retains access via existing PUBLIC grants.)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
  END LOOP;
END
$$;
