-- Create a function to create bank transactions for sales orders
CREATE OR REPLACE FUNCTION public.create_sales_bank_transaction()
RETURNS TRIGGER AS $$
DECLARE
  payment_method_data RECORD;
BEGIN
  -- Only create bank transaction if payment is completed and payment method exists
  IF NEW.payment_status = 'COMPLETED' AND NEW.sales_payment_method_id IS NOT NULL THEN
    
    -- Get payment method and bank account details
    SELECT 
      spm.payment_gateway,
      spm.bank_account_id,
      ba.account_name
    INTO payment_method_data
    FROM sales_payment_methods spm
    LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
    WHERE spm.id = NEW.sales_payment_method_id;
    
    -- Only create bank transaction for NON-payment gateway methods (direct methods)
    -- Payment gateway transactions will be handled through settlements
    IF payment_method_data.payment_gateway = false AND payment_method_data.bank_account_id IS NOT NULL THEN
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
        payment_method_data.bank_account_id,
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

-- Create trigger to run this function
CREATE OR REPLACE TRIGGER trigger_create_sales_bank_transaction
    AFTER INSERT OR UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION create_sales_bank_transaction();