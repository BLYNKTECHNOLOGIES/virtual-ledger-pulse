-- Fix remaining trigger functions missing SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.check_stock_before_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  current_stock NUMERIC;
  product_name TEXT;
BEGIN
  IF NEW.movement_type = 'OUT' THEN
    SELECT current_stock_quantity, name INTO current_stock, product_name
    FROM products WHERE id = NEW.product_id;
    IF current_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
    IF current_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Current: %, Required: %',
        product_name, current_stock, NEW.quantity;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_client_buyer_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.is_buyer = true AND (NEW.buyer_approval_status IS NULL OR NEW.buyer_approval_status = '') THEN
    NEW.buyer_approval_status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_client_seller_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.is_seller = true AND (NEW.seller_approval_status IS NULL OR NEW.seller_approval_status = '') THEN
    NEW.seller_approval_status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clients 
      WHERE name = NEW.customer_name OR email = NEW.customer_email
    ) THEN
      INSERT INTO public.client_onboarding_approvals (
        sales_order_id, client_name, client_email, client_phone,
        order_amount, order_date, aadhar_front_url, aadhar_back_url,
        additional_documents_url, binance_id_screenshot_url
      ) VALUES (
        NEW.id, NEW.customer_name, NEW.customer_email, NEW.customer_phone,
        NEW.total_amount, NEW.order_date, NEW.aadhar_front_url, NEW.aadhar_back_url,
        NEW.additional_documents_url, NEW.binance_id_screenshot_url
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_usdt_stock_on_wallet_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.track_purchase_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_purchase_order_total_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_stock_from_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.movement_type = 'IN' THEN
    UPDATE products SET current_stock_quantity = current_stock_quantity + NEW.quantity, updated_at = now()
    WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'OUT' THEN
    UPDATE products SET current_stock_quantity = current_stock_quantity - NEW.quantity, updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_average_prices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_wallet_transaction_balances()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  current_bal NUMERIC;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount
      WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount
      ELSE 0
    END
  ), 0) INTO current_bal
  FROM wallet_transactions
  WHERE wallet_id = NEW.wallet_id AND asset_code = COALESCE(NEW.asset_code, 'USDT');
  
  NEW.balance_before := current_bal;
  
  IF NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    NEW.balance_after := current_bal + NEW.amount;
  ELSIF NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    NEW.balance_after := current_bal - NEW.amount;
  ELSE
    NEW.balance_after := current_bal;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Updated_at trigger functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_ad_pricing_rules_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_documents_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_investigation_approvals_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_purchase_order_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_rekyc_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_risk_flags_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_screen_share_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_terminal_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_payment_methods_with_bank_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_unique_client_bank_numbers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;