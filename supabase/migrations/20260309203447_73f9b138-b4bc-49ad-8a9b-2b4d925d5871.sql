
-- =====================================================
-- Phase 3B: Add idempotency guard to sales bank transaction trigger
-- Prevents duplicate bank entries when operator retries create
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_sales_bank_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      
    -- Case 2: Direct sales with bank_account_id
    ELSIF NEW.bank_account_id IS NOT NULL AND NEW.settlement_status = 'DIRECT' THEN
      target_bank_account_id := NEW.bank_account_id;
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
$$;

-- Also add idempotency to stock transaction creation
CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_count INT;
  v_product_name TEXT;
BEGIN
  IF NEW.status = 'COMPLETED' AND NEW.product_id IS NOT NULL AND (NEW.quantity IS NOT NULL AND NEW.quantity > 0) THEN
    -- IDEMPOTENCY: Check if stock transaction already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM public.stock_transactions
    WHERE reference_number = NEW.order_number
    AND transaction_type = 'Sales';
    
    IF v_existing_count > 0 THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
    
    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_price,
      total_amount, reference_number, notes
    ) VALUES (
      NEW.product_id, 'Sales', -(NEW.quantity),
      COALESCE(NEW.price_per_unit, 0), COALESCE(NEW.total_amount, 0),
      NEW.order_number,
      'Sales Order - ' || NEW.order_number || ' - ' || COALESCE(NEW.client_name, '')
    );
  END IF;
  
  RETURN NEW;
END;
$$;
