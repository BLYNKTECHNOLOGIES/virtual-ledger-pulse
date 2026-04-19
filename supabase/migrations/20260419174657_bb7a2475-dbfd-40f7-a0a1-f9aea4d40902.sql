-- Atomic seller-client creation with supporting evidence to satisfy
-- the deferred trg_prevent_ghost_pending_client constraint trigger.
-- Inserts the client AND a client_binance_nicknames row in the same
-- transaction so the deferred check at COMMIT finds supporting evidence.
CREATE OR REPLACE FUNCTION public.create_seller_client_with_evidence(
  p_name TEXT,
  p_client_id TEXT,
  p_phone TEXT DEFAULT NULL,
  p_nickname TEXT DEFAULT NULL,
  p_verified_name TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, client_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_nick TEXT := NULLIF(TRIM(COALESCE(p_nickname, '')), '');
  v_vname TEXT := NULLIF(TRIM(COALESCE(p_verified_name, '')), '');
BEGIN
  -- Refuse masked / sentinel nicknames as evidence
  IF v_nick IS NOT NULL AND (v_nick ILIKE '%*%' OR LOWER(v_nick) = 'unknown') THEN
    v_nick := NULL;
  END IF;
  IF v_vname IS NOT NULL AND (v_vname ILIKE '%*%' OR LOWER(v_vname) = 'unknown') THEN
    v_vname := NULL;
  END IF;

  INSERT INTO public.clients (
    name, client_id, client_type, kyc_status, date_of_onboarding,
    phone, risk_appetite, is_seller, is_buyer,
    seller_approval_status, buyer_approval_status
  ) VALUES (
    TRIM(p_name), p_client_id, 'SELLER', 'PENDING', CURRENT_DATE,
    NULLIF(TRIM(COALESCE(p_phone,'')), ''), 'STANDARD', true, false,
    'PENDING', 'NOT_APPLICABLE'
  )
  RETURNING public.clients.id INTO v_new_id;

  -- Attach supporting evidence so the deferred ghost-client check passes.
  -- Nickname link is preferred (also enables future auto-matching).
  IF v_nick IS NOT NULL THEN
    INSERT INTO public.client_binance_nicknames (client_id, nickname, source)
    VALUES (v_new_id, v_nick, 'approval')
    ON CONFLICT (nickname) DO NOTHING;
  END IF;

  -- Verified name only attaches when it correlates to the client name —
  -- the existing trg_validate_verified_name_attachment trigger enforces this,
  -- so we only attempt it when the verified name equals the client name.
  IF v_vname IS NOT NULL
     AND LOWER(TRIM(v_vname)) = LOWER(TRIM(p_name)) THEN
    INSERT INTO public.client_verified_names (client_id, verified_name, source)
    VALUES (v_new_id, v_vname, 'approval')
    ON CONFLICT (client_id, verified_name) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT c.id, c.client_id FROM public.clients c WHERE c.id = v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_seller_client_with_evidence(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;