
-- Remove duplicate trigger on purchase_order_items (keep the newer one with clearer naming)
DROP TRIGGER IF EXISTS trigger_update_average_prices ON public.purchase_order_items;
