DROP POLICY IF EXISTS "Allow reading system functions" ON public.system_functions;
CREATE POLICY "Allow reading system functions" ON public.system_functions FOR SELECT TO authenticated USING (true);