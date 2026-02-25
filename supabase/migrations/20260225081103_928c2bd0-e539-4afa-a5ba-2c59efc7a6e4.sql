
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can manage supervisor mappings" ON public.terminal_user_supervisor_mappings;
DROP POLICY IF EXISTS "Authenticated users can view supervisor mappings" ON public.terminal_user_supervisor_mappings;

-- Recreate with public role (matching other terminal tables)
CREATE POLICY "Supervisor mappings readable" ON public.terminal_user_supervisor_mappings
  FOR SELECT TO public USING (true);

CREATE POLICY "Supervisor mappings manageable" ON public.terminal_user_supervisor_mappings
  FOR ALL TO public USING (true) WITH CHECK (true);
