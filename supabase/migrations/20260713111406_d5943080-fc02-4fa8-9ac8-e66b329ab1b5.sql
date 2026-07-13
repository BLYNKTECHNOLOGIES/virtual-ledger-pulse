DO $$
DECLARE
  v_client_count integer;
  v_contact_count integer;
BEGIN
  SELECT count(*) INTO v_client_count
  FROM public.clients
  WHERE phone = '8527966109'
    AND is_deleted = false;

  SELECT count(*) INTO v_contact_count
  FROM public.counterparty_contact_records
  WHERE contact_number = '8527966109';

  IF v_client_count <> 0 OR v_contact_count <> 0 THEN
    RAISE EXCEPTION 'Phone cleanup incomplete: clients=%, counterparty_contacts=%', v_client_count, v_contact_count;
  END IF;
END $$;