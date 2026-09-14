CREATE OR REPLACE FUNCTION public.block_already_settled_pending_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_order_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM payment_gateway_settlement_items i
    JOIN payment_gateway_settlements s ON s.id = i.settlement_id
    WHERE i.sales_order_id = NEW.sales_order_id
      AND i.reversed_at IS NULL
      AND s.status = 'COMPLETED'
      AND i.amount = COALESCE(NEW.settlement_amount, NEW.total_amount)
  ) THEN
    RETURN NULL; -- already settled: never re-create a pending row for this leg
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_already_settled_pending_settlement ON public.pending_settlements;
CREATE TRIGGER trg_block_already_settled_pending_settlement
BEFORE INSERT ON public.pending_settlements
FOR EACH ROW EXECUTE FUNCTION public.block_already_settled_pending_settlement();