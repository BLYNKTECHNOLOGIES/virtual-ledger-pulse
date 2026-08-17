REVOKE EXECUTE ON FUNCTION public.get_product_avg_costs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_product_cost_basis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_unpaid_tds_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_avg_costs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_cost_basis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unpaid_tds_total() TO authenticated, service_role;