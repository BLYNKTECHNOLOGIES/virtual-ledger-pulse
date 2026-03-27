CREATE OR REPLACE FUNCTION public.create_sales_bank_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  payment_method_data RECORD;
  target_bank_account_id UUID;
  v_existing_count INT;
BEGIN
  -- Only process completed sales orders
  IF NEW.payment_status = 'COMPLETED' THEN
    
    -- IDEMPOTENCY: Check if a bank transaction already exists for this order
    SELECT COUNT(*) INTO v_existing_count
    FROM public.bank_transactions
    WHERE reference_number = NEW.order_number
    AND category = 'Sales';
    
    IF v_existing_count > 0 THEN
      RAISE WARNING 'Bank transaction already exists for order %, skipping duplicate', NEW.order_number;
      RETURN NEW;
    END IF;
    
    -- Case 1: Sales order with payment method
    IF NEW.sales_payment_method_id IS NOT NULL THEN
      SELECT 
        spm.payment_gateway,
        spm.bank_account_id,
        ba.account_name
      INTO payment_method_data
      FROM sales_payment_methods spm
      LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
      WHERE spm.id = NEW.sales_payment_method_id;
      
      IF payment_method_data.payment_gateway = false AND payment_method_data.bank_account_id IS NOT NULL THEN
        target_bank_account_id := payment_method_data.bank_account_id;
      END IF;
    END IF;
    
    -- Create bank transaction if we have a target bank account
    IF target_bank_account_id IS NOT NULL THEN
      INSERT INTO public.bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        description, reference_number, category, related_account_name
      ) VALUES (
        target_bank_account_id, 'INCOME', NEW.total_amount,
        NEW.order_date::date,
        'Sales Order - ' || NEW.order_number || ' - ' || NEW.client_name,
        NEW.order_number, 'Sales', NEW.client_name
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;