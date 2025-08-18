-- Create missing pending settlement records for existing sales orders
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
)
SELECT 
    so.id as sales_order_id,
    so.order_number,
    so.client_name,
    so.total_amount,
    so.total_amount as settlement_amount,
    so.order_date::date,
    so.sales_payment_method_id as payment_method_id,
    spm.bank_account_id,
    COALESCE(spm.settlement_cycle, 'T+1 Day') as settlement_cycle,
    spm.settlement_days,
    CASE 
        WHEN spm.settlement_days > 0 THEN 
            (so.order_date::date + INTERVAL '1 day' * spm.settlement_days)::date
        ELSE 
            (so.order_date::date + INTERVAL '1 day')::date
    END as expected_settlement_date,
    'PENDING' as status,
    so.created_at
FROM sales_orders so
JOIN sales_payment_methods spm ON so.sales_payment_method_id = spm.id
LEFT JOIN pending_settlements ps ON so.id = ps.sales_order_id
WHERE so.settlement_status = 'PENDING' 
    AND so.payment_status = 'COMPLETED'
    AND spm.payment_gateway = true
    AND ps.id IS NULL;

-- Ensure the trigger function is working properly
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
        NEW.total_amount, -- Default settlement amount same as total
        NEW.order_date::date,
        NEW.sales_payment_method_id,
        payment_method_data.bank_account_id,
        COALESCE(payment_method_data.settlement_cycle, 'T+1 Day'),
        payment_method_data.settlement_days,
        CASE 
          WHEN payment_method_data.settlement_days > 0 THEN 
            (NEW.order_date::date + INTERVAL '1 day' * payment_method_data.settlement_days)::date
          ELSE 
            (NEW.order_date::date + INTERVAL '1 day')::date -- Default to next day
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

-- Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS create_pending_settlement_trigger ON sales_orders;
CREATE TRIGGER create_pending_settlement_trigger
    AFTER INSERT OR UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION create_pending_settlement();