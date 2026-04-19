CREATE OR REPLACE FUNCTION public.create_seller_client_with_evidence(
  p_name text,
  p_client_id text,
  p_phone text DEFAULT NULL,
  p_nickname text DEFAULT NULL,
  p_verified_name text DEFAULT NULL
)
RETURNS TABLE(id uuid, client_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

  INSERT INTO public.clients (
    name, client_id, client_type, kyc_status, date_of_onboarding,
    phone, risk_appetite, is_buyer, is_seller,
    buyer_approval_status, seller_approval_status
  ) VALUES (
    btrim(p_name), p_client_id, 'SELLER', 'PENDING', CURRENT_DATE,
    p_phone, 'STANDARD', false, true,
    'NOT_APPLICABLE', 'PENDING'
  )
  RETURNING public.clients.id INTO v_new_id;

  IF p_nickname IS NOT NULL AND length(btrim(p_nickname)) > 0 THEN
    INSERT INTO public.client_binance_nicknames (client_id, nickname, source, is_active)
    VALUES (v_new_id, btrim(p_nickname), 'approval', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_verified_name IS NOT NULL AND length(btrim(p_verified_name)) > 0 THEN
    INSERT INTO public.client_verified_names (client_id, verified_name, source)
    VALUES (v_new_id, btrim(p_verified_name), 'approval')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT c.id, c.client_id FROM public.clients c WHERE c.id = v_new_id;
END;
$$;