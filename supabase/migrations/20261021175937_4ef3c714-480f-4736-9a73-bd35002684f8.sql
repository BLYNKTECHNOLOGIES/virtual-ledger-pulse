CREATE OR REPLACE FUNCTION public.report_blocked_recipients(p_emails text[])
RETURNS TABLE(email text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (SELECT DISTINCT lower(trim(x)) AS e FROM unnest(p_emails) x WHERE coalesce(trim(x),'') <> '')
  SELECT r.e, 'ERP user deactivated' FROM r
   WHERE EXISTS (SELECT 1 FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
                  WHERE (lower(u.email) = r.e OR lower(a.email) = r.e) AND upper(coalesce(u.status,'')) <> 'ACTIVE')
     AND NOT EXISTS (SELECT 1 FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
                  WHERE (lower(u.email) = r.e OR lower(a.email) = r.e) AND upper(coalesce(u.status,'')) = 'ACTIVE')
  UNION
  SELECT r.e, 'ERP login removed' FROM r
   WHERE EXISTS (SELECT 1 FROM public.hr_erp_access_revocations v WHERE lower(v.target_email) = r.e)
     AND NOT EXISTS (SELECT 1 FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
                  WHERE (lower(u.email) = r.e OR lower(a.email) = r.e) AND upper(coalesce(u.status,'')) = 'ACTIVE')
  UNION
  SELECT r.e, 'ERP login deleted' FROM r
   WHERE EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = r.e
                  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id));
$$;
REVOKE ALL ON FUNCTION public.report_blocked_recipients(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_blocked_recipients(text[]) TO service_role;