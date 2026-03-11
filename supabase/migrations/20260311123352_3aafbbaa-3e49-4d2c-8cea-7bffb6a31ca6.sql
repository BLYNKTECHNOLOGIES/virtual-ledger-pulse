
-- Fix the create_client_onboarding_approval trigger function
-- It references non-existent columns: customer_name, customer_email, customer_phone, 
-- aadhar_front_url, aadhar_back_url, additional_documents_url, binance_id_screenshot_url
-- sales_orders only has: client_name, client_phone
CREATE OR REPLACE FUNCTION create_client_onboarding_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clients 
      WHERE name = NEW.client_name
    ) THEN
      INSERT INTO public.client_onboarding_approvals (
        sales_order_id, client_name, client_phone,
        order_amount, order_date
      ) VALUES (
        NEW.id, NEW.client_name, NEW.client_phone,
        NEW.total_amount, NEW.order_date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
