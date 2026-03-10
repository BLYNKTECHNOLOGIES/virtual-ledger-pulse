
-- Fix the trigger: only set settlement_status on INSERT, not on every UPDATE
-- On UPDATE, only reset to PENDING if the payment method itself changed
CREATE OR REPLACE FUNCTION set_settlement_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_payment_gateway BOOLEAN := false;
BEGIN
  -- Check if payment method is a payment gateway
  IF NEW.sales_payment_method_id IS NOT NULL THEN
    SELECT payment_gateway INTO is_payment_gateway
    FROM sales_payment_methods 
    WHERE id = NEW.sales_payment_method_id;
  END IF;
  
  -- On INSERT: always set based on payment method type
  IF TG_OP = 'INSERT' THEN
    IF is_payment_gateway THEN
      NEW.settlement_status := 'PENDING';
    ELSE
      NEW.settlement_status := 'DIRECT';
    END IF;
  END IF;
  
  -- On UPDATE: only reset if the payment method changed
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sales_payment_method_id IS DISTINCT FROM OLD.sales_payment_method_id THEN
      IF is_payment_gateway THEN
        NEW.settlement_status := 'PENDING';
        NEW.settled_at := NULL;
      ELSE
        NEW.settlement_status := 'DIRECT';
        NEW.settled_at := NULL;
      END IF;
    END IF;
    -- Otherwise, preserve whatever settlement_status is being set (e.g. SETTLED)
  END IF;
  
  RETURN NEW;
END;
$$;

-- Now re-apply the data fix since trigger is fixed
UPDATE sales_orders so
SET settlement_status = 'SETTLED',
    settled_at = pgs.settlement_date
FROM payment_gateway_settlement_items pgsi
JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
WHERE pgsi.sales_order_id = so.id
  AND pgs.status = 'COMPLETED'
  AND so.settlement_status = 'PENDING';
