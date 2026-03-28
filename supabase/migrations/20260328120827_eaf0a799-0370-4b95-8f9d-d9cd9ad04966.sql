-- Fix L10 trigger: only fire on relevant column changes, not every update
DROP TRIGGER IF EXISTS trg_update_client_monthly_usage ON public.sales_orders;

-- Re-create with column-specific UPDATE trigger
CREATE TRIGGER trg_update_client_monthly_usage
  AFTER INSERT OR DELETE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_client_monthly_usage_on_sale();

-- Separate UPDATE trigger restricted to relevant columns only
CREATE TRIGGER trg_update_client_monthly_usage_on_update
  AFTER UPDATE OF status, total_amount, client_id, client_name ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_client_monthly_usage_on_sale();