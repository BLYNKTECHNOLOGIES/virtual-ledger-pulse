
DROP POLICY IF EXISTS "Public read access" ON public.raci_roles;
DROP POLICY IF EXISTS "Public read access" ON public.raci_categories;
DROP POLICY IF EXISTS "Public read access" ON public.raci_tasks;
DROP POLICY IF EXISTS "Public read access" ON public.role_kras;
DROP POLICY IF EXISTS "Public read access" ON public.role_kpis;

CREATE POLICY "Authenticated read access" ON public.raci_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read access" ON public.raci_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read access" ON public.raci_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read access" ON public.role_kras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read access" ON public.role_kpis FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.raci_roles FROM anon;
REVOKE SELECT ON public.raci_categories FROM anon;
REVOKE SELECT ON public.raci_tasks FROM anon;
REVOKE SELECT ON public.role_kras FROM anon;
REVOKE SELECT ON public.role_kpis FROM anon;
