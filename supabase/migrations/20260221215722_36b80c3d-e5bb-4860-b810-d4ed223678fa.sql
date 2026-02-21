
-- Fix the create_pending_settlement trigger to NOT create a pending record 
-- if the order already exists in a COMPLETED settlement batch
CREATE OR REPLACE FUNCTION public.create_pending_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  payment_method_data RECORD;
BEGIN
  -- Only create pending settlement for payment gateway orders that are completed
  IF NEW.payment_status = 'COMPLETED' AND NEW.settlement_status = 'PENDING' 
     AND NEW.sales_payment_method_id IS NOT NULL THEN
    
    -- GUARD: Skip if this order already exists in a COMPLETED settlement batch
    IF EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = NEW.id
        AND pgs.status = 'COMPLETED'
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Get payment method and bank account details
    SELECT 
      spm.id,
      spm.payment_gateway,
      spm.settlement_cycle,
      spm.settlement_days,
      spm.bank_account_id,
      ba.account_name,
      ba.bank_name
    INTO payment_method_data
    FROM sales_payment_methods spm
    LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
    WHERE spm.id = NEW.sales_payment_method_id;
    
    -- Only create pending settlement if it's a payment gateway method
    IF payment_method_data.payment_gateway = true THEN
      INSERT INTO public.pending_settlements (
        sales_order_id,
        order_number,
        client_name,
        total_amount,
        settlement_amount,
        order_date,
        payment_method_id,
        bank_account_id,
        settlement_cycle,
        settlement_days,
        expected_settlement_date,
        status,
        created_at
      ) VALUES (
        NEW.id,
        NEW.order_number,
        NEW.client_name,
        NEW.total_amount,
        NEW.total_amount,
        NEW.order_date::date,
        NEW.sales_payment_method_id,
        payment_method_data.bank_account_id,
        COALESCE(payment_method_data.settlement_cycle, 'T+1 Day'),
        payment_method_data.settlement_days,
        CASE 
          WHEN payment_method_data.settlement_days > 0 THEN 
            (NEW.order_date::date + INTERVAL '1 day' * payment_method_data.settlement_days)::date
          ELSE 
            (NEW.order_date::date + INTERVAL '1 day')::date
        END,
        'PENDING',
        now()
      )
      ON CONFLICT (sales_order_id) DO UPDATE SET
        payment_method_id = EXCLUDED.payment_method_id,
        bank_account_id = EXCLUDED.bank_account_id,
        settlement_cycle = EXCLUDED.settlement_cycle,
        settlement_days = EXCLUDED.settlement_days,
        expected_settlement_date = EXCLUDED.expected_settlement_date,
        updated_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Now cleanup again: first delete ghosts, then fix settlement status
-- (the trigger won't re-create them now because of the new guard)
CREATE OR REPLACE FUNCTION cleanup_ghost_pending_settlements_v2()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted int;
  v_updated int;
BEGIN
  DELETE FROM pending_settlements
  WHERE status = 'PENDING'
    AND EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = pending_settlements.sales_order_id
        AND pgs.status = 'COMPLETED'
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE sales_orders
  SET settlement_status = 'SETTLED'
  WHERE settlement_status = 'PENDING'
    AND EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = sales_orders.id
        AND pgs.status = 'COMPLETED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pending_settlements ps
      WHERE ps.sales_order_id = sales_orders.id AND ps.status = 'PENDING'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

SELECT cleanup_ghost_pending_settlements_v2();

DROP FUNCTION cleanup_ghost_pending_settlements_v2();
