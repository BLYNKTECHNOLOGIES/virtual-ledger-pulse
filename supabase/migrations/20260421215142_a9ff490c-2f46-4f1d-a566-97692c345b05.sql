
CREATE OR REPLACE FUNCTION public.create_buyer_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text DEFAULT NULL,
  p_order_amount numeric DEFAULT 0,
  p_order_date date DEFAULT CURRENT_DATE,
  p_sales_order_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, client_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Insert evidence FIRST so the deferred ghost-pending trigger finds a matching
  -- client_onboarding_approvals row (matched by lower(trim(client_name)) = lower(trim(name))).
  INSERT INTO public.client_onboarding_approvals (
    client_name, client_phone, order_amount, order_date,
    approval_status, sales_order_id
  ) VALUES (
    p_name, p_phone, COALESCE(p_order_amount, 0), COALESCE(p_order_date, CURRENT_DATE),
    'PENDING', p_sales_order_id
  );

  INSERT INTO public.clients (
    name, client_id, client_type, kyc_status, date_of_onboarding,
    phone, state, risk_appetite, is_buyer, is_seller,
    buyer_approval_status, seller_approval_status
  ) VALUES (
    TRIM(p_name), p_client_id, 'BUYER', 'PENDING', CURRENT_DATE,
    NULLIF(TRIM(COALESCE(p_phone,'')),''), NULL, 'STANDARD', true, false,
    'PENDING', 'NOT_APPLICABLE'
  )
  RETURNING public.clients.id INTO v_id;

  -- Link approval row back to the new client
  UPDATE public.client_onboarding_approvals
     SET resolved_client_id = v_id
   WHERE resolved_client_id IS NULL
     AND LOWER(TRIM(client_name)) = LOWER(TRIM(p_name))
     AND approval_status = 'PENDING';

  RETURN QUERY SELECT v_id, p_client_id;
END;
$$;
