-- 1. Restore the purchase_order_total_paid trigger to properly track payments
CREATE OR REPLACE FUNCTION public.update_purchase_order_total_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.purchase_orders
    SET total_paid = COALESCE(total_paid, 0) + NEW.amount_paid
    WHERE id = NEW.order_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.purchase_orders
    SET total_paid = GREATEST(0, COALESCE(total_paid, 0) - OLD.amount_paid)
    WHERE id = OLD.order_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.purchase_orders
    SET total_paid = GREATEST(0, COALESCE(total_paid, 0) - OLD.amount_paid + NEW.amount_paid)
    WHERE id = NEW.order_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- Ensure trigger covers INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS purchase_order_payment_trigger ON public.purchase_order_payments;
CREATE TRIGGER purchase_order_payment_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_payments
  FOR EACH ROW EXECUTE FUNCTION update_purchase_order_total_paid();

-- 2. Fix corrupted total_paid for completed manual orders with no separate payments
-- For these, total_paid should equal net_payable_amount (they were paid at creation)
UPDATE public.purchase_orders
SET total_paid = net_payable_amount
WHERE id IN (
  SELECT po.id FROM purchase_orders po
  WHERE ABS(COALESCE(po.total_paid,0) - COALESCE(po.net_payable_amount, po.total_amount)) > 1
    AND po.status = 'COMPLETED'
    AND NOT EXISTS (SELECT 1 FROM purchase_order_payments pop WHERE pop.order_id = po.id)
);
