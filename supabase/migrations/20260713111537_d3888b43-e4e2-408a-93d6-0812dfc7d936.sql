DO $$
DECLARE
  v_client_phone_count integer;
  v_contact_phone_count integer;
  v_mapped_name text;
BEGIN
  SELECT count(*) INTO v_client_phone_count
  FROM public.clients
  WHERE phone = '8527966109'
    AND is_deleted = false;

  SELECT count(*) INTO v_contact_phone_count
  FROM public.counterparty_contact_records
  WHERE contact_number = '8527966109';

  SELECT c.name INTO v_mapped_name
  FROM public.client_binance_usernos cbu
  JOIN public.clients c ON c.id = cbu.client_id
  WHERE cbu.cp_userno = 'sde20fab01aea3d92abe96526dbaa726b'
    AND cbu.is_active = true
    AND c.is_deleted = false
  LIMIT 1;

  IF v_client_phone_count <> 0 OR v_contact_phone_count <> 0 OR v_mapped_name IS DISTINCT FROM 'Ganauri Kumar' THEN
    RAISE EXCEPTION 'Verification failed: client_phone_count=%, contact_phone_count=%, mapped_name=%', v_client_phone_count, v_contact_phone_count, v_mapped_name;
  END IF;
END $$;