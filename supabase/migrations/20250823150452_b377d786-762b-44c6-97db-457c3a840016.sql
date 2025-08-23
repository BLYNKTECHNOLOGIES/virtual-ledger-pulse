-- Create function to automatically create lead from canceled buy orders
CREATE OR REPLACE FUNCTION public.create_lead_from_canceled_buy_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create lead if status changes to CANCELLED and order type is BUY
  IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' AND NEW.order_type = 'BUY' THEN
    
    -- Insert new lead from canceled buy order
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
      COALESCE(NEW.customer_name, NEW.client_name, 'Unknown Customer'),
      COALESCE(NEW.customer_phone, NEW.client_phone),
      NEW.total_amount,
      'BUY',
      CASE 
        WHEN NEW.customer_email IS NOT NULL OR NEW.client_email IS NOT NULL THEN 'EMAIL'
        WHEN NEW.customer_phone IS NOT NULL OR NEW.client_phone IS NOT NULL THEN 'PHONE'
        ELSE 'OTHER'
      END,
      COALESCE(NEW.customer_email, NEW.client_email, NEW.customer_phone, NEW.client_phone),
      'Auto-generated from canceled buy order #' || NEW.order_number || 
      CASE WHEN NEW.cancellation_reason IS NOT NULL THEN ' - Reason: ' || NEW.cancellation_reason ELSE '' END,
      'NEW',
      NOW(),
      NOW()
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sales_orders table to automatically create leads from canceled buy orders
DROP TRIGGER IF EXISTS trigger_create_lead_from_canceled_buy_order ON public.sales_orders;
CREATE TRIGGER trigger_create_lead_from_canceled_buy_order
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_lead_from_canceled_buy_order();