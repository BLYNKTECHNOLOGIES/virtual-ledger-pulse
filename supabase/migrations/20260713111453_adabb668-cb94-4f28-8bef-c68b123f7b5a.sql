DO $$
DECLARE
  v_client_id uuid;
  v_existing_client_id uuid;
  v_userno text := 'sde20fab01aea3d92abe96526dbaa726b';
BEGIN
  SELECT client_id INTO v_existing_client_id
  FROM public.client_binance_usernos
  WHERE cp_userno = v_userno
    AND is_active = true
  LIMIT 1;

  IF v_existing_client_id IS NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE lower(name) = lower('Ganauri Kumar')
      AND is_deleted = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      PERFORM public.link_client_userno(v_client_id, v_userno, 'cleanup_after_phone_collision');
    END IF;
  END IF;
END $$;