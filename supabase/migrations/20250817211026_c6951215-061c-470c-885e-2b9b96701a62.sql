-- Update the pending settlement creation function to properly populate bank account and payment method details
CREATE OR REPLACE FUNCTION public.create_pending_settlement()
RETURNS TRIGGER AS $$
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
        payment_method_data.settlement_cycle,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the sales order creation trigger to set proper settlement status
CREATE OR REPLACE FUNCTION public.set_settlement_status()
RETURNS TRIGGER AS $$
DECLARE
  is_payment_gateway BOOLEAN := false;
BEGIN
  -- Check if payment method is a payment gateway
  IF NEW.sales_payment_method_id IS NOT NULL THEN
    SELECT payment_gateway INTO is_payment_gateway
    FROM sales_payment_methods 
    WHERE id = NEW.sales_payment_method_id;
  END IF;
  
  -- Set settlement status based on payment method type
  IF is_payment_gateway THEN
    NEW.settlement_status := 'PENDING';
  ELSE
    NEW.settlement_status := 'DIRECT';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set settlement status before insert/update
DROP TRIGGER IF EXISTS set_settlement_status_trigger ON public.sales_orders;
CREATE TRIGGER set_settlement_status_trigger
BEFORE INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_settlement_status();