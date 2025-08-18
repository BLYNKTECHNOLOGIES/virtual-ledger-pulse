-- Update the trigger function to handle direct sales without payment methods
CREATE OR REPLACE FUNCTION public.create_sales_bank_transaction()
RETURNS TRIGGER AS $$
DECLARE
  payment_method_data RECORD;
  target_bank_account_id UUID;
BEGIN
  -- Only process completed sales orders
  IF NEW.payment_status = 'COMPLETED' THEN
    
    -- Case 1: Sales order with payment method (SalesEntryDialog, StepBySalesFlow)
    IF NEW.sales_payment_method_id IS NOT NULL THEN
      -- Get payment method and bank account details
      SELECT 
        spm.payment_gateway,
        spm.bank_account_id,
        ba.account_name
      INTO payment_method_data
      FROM sales_payment_methods spm
      LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
      WHERE spm.id = NEW.sales_payment_method_id;
      
      -- Only create bank transaction for NON-payment gateway methods
      IF payment_method_data.payment_gateway = false AND payment_method_data.bank_account_id IS NOT NULL THEN
        target_bank_account_id := payment_method_data.bank_account_id;
      END IF;
      
    -- Case 2: Direct sales without payment method (QuickSalesOrderDialog)  
    ELSIF NEW.settlement_status = 'DIRECT' AND OLD.settlement_status IS DISTINCT FROM 'DIRECT' THEN
      -- This is a direct sale, we need to find which bank account to credit
      -- For now, we'll need to identify the bank account from the context
      -- Since QuickSalesOrderDialog doesn't store bank_account_id in sales_orders,
      -- we can't create the transaction automatically. Let's modify this approach.
      
      -- Don't create transaction here, let the application handle it
      target_bank_account_id := NULL;
    END IF;
    
    -- Create bank transaction if we have a target bank account
    IF target_bank_account_id IS NOT NULL THEN
      INSERT INTO public.bank_transactions (
        bank_account_id,
        transaction_type,
        amount,
        transaction_date,
        description,
        reference_number,
        category,
        related_account_name
      ) VALUES (
        target_bank_account_id,
        'INCOME',
        NEW.total_amount,
        NEW.order_date::date,
        'Sales Order - ' || NEW.order_number || ' - ' || NEW.client_name,
        NEW.order_number,
        'Sales',
        NEW.client_name
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;