-- Fix the create_lead_from_canceled_buy_order function that references non-existent order_type column
-- The sales_orders table doesn't have an order_type column, so we remove that check
-- This function should only trigger on cancelled orders

CREATE OR REPLACE FUNCTION public.create_lead_from_canceled_buy_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create lead if status changes to CANCELLED
  -- Removed the order_type check since sales_orders doesn't have this column
  IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    
    -- Insert new lead from canceled order
    INSERT INTO public.leads (
      name,
      contact_number,
      estimated_order_value,
      lead_type,
      contact_channel,
      contact_channel_value,
      description,
      status,
      created_at,
      updated_at
    ) VALUES (
      COALESCE(NEW.client_name, 'Unknown Customer'),
      NEW.client_phone,
      NEW.total_amount,
      'BUY',
      CASE 
        WHEN NEW.client_phone IS NOT NULL THEN 'PHONE'
        ELSE 'OTHER'
      END,
      NEW.client_phone,
      'Auto-generated from canceled sales order #' || NEW.order_number,
      'NEW',
      NOW(),
      NOW()
    );
    
  END IF;
  
  RETURN NEW;
END;
$$;