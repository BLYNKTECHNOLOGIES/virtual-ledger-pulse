-- Fix all remaining double balance update issues
-- Remove ALL direct balance updates and enforce single-chain pattern

-- 1. First, let's create a clean update function that only handles transactions
CREATE OR REPLACE FUNCTION public.update_bank_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount,
          updated_at = now()
      WHERE id = OLD.bank_account_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- First reverse the old transaction
    IF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - OLD.amount
      WHERE id = OLD.bank_account_id;
    ELSIF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + OLD.amount
      WHERE id = OLD.bank_account_id;
    END IF;

    -- Then apply the new transaction
    IF NEW.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      UPDATE public.bank_accounts 
      SET balance = balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    ELSIF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      UPDATE public.bank_accounts 
      SET balance = balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.bank_account_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

-- 2. Fix all manual purchase functions to NOT update balance directly
CREATE OR REPLACE FUNCTION public.create_manual_purchase_order(
  p_order_number text, 
  p_supplier_name text, 
  p_order_date date, 
  p_description text, 
  p_total_amount numeric, 
  p_contact_number text, 
  p_status text, 
  p_bank_account_id uuid, 
  p_product_id uuid, 
  p_quantity numeric, 
  p_unit_price numeric, 
  p_credit_wallet_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  purchase_order_id UUID;
BEGIN
  -- Create the purchase order
  INSERT INTO public.purchase_orders (
    order_number,
    supplier_name, 
    order_date,
    description,
    total_amount,
    contact_number,
    status,
    bank_account_id
  ) VALUES (
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_description,
    p_total_amount,
    p_contact_number,
    p_status,
    CASE WHEN p_status = 'COMPLETED' THEN p_bank_account_id ELSE NULL END
  ) RETURNING id INTO purchase_order_id;
  
  -- Create purchase order item
  INSERT INTO public.purchase_order_items (
    purchase_order_id,
    product_id,
    quantity,
    unit_price,
    total_price
  ) VALUES (
    purchase_order_id,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_total_amount
  );
  
  -- Create bank transaction ONLY if COMPLETED - let trigger handle balance
  IF p_status = 'COMPLETED' THEN
    INSERT INTO public.bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      description,
      reference_number,
      transaction_date
    ) VALUES (
      p_bank_account_id,
      'EXPENSE',
      p_total_amount,
      'Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
      p_order_number,
      p_order_date
    );
  END IF;
  
  -- Handle USDT wallet credit if specified
  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (
      wallet_id,
      transaction_type,
      amount,
      reference_type,
      reference_id,
      description,
      balance_before,
      balance_after
    ) VALUES (
      p_credit_wallet_id,
      'CREDIT',
      p_quantity,
      'PURCHASE_ORDER',
      purchase_order_id,
      'USDT purchased via purchase order ' || p_order_number,
      0, -- Will be updated by trigger
      0  -- Will be updated by trigger
    );
  ELSE
    -- Update product stock for non-USDT products
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + p_quantity
    WHERE id = p_product_id;
  END IF;
  
  RETURN purchase_order_id;
END;
$function$;