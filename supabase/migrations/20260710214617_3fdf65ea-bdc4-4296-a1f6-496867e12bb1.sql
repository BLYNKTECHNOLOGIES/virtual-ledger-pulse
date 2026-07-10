-- Reconcile the 3 remaining contaminated multi-userNo client cards.
-- Strategy: userNo is authoritative. Split foreign identities into their rightful
-- clients (existing owner or a new PENDING client), reassign orders + userNo links.
DO $$
DECLARE
  v_karthik_shetty uuid;
  v_sadanand uuid;
  v_anand_dubey uuid := '06f3bb41-c9c8-4b62-ae05-f3e6b7b0db75';
  v_sonu uuid := '31d1fe6e-fac2-4d96-9833-858b51f341f9';
  v_karthik_shetty_uno text := 'sfb426e88c1f2347a99aabd14d0329e18';
  v_sadanand_uno text := 's0f0a44133d1f3a5f9808cb5a8b7b90cb';
  v_dubey_uno text := 's6a84b84af5d43600b134ca75ac7e3ac9';
  v_sonu_uno text := 'sd2bf4319cba93393b3de783f2a21b2f1';
BEGIN
  ---------------------------------------------------------------------------
  -- A. KARTHIK SHETTY  -> new PENDING client, split off S KARTHIK card
  ---------------------------------------------------------------------------
  v_karthik_shetty := gen_random_uuid();
  INSERT INTO public.clients (id, client_id, name, client_type, date_of_onboarding,
        kyc_status, buyer_approval_status, seller_approval_status, is_deleted)
  VALUES (v_karthik_shetty, upper(substr(md5(random()::text),1,6)), 'KARTHIK SHETTY',
        'INDIVIDUAL', CURRENT_DATE, 'PENDING', 'APPROVED', 'APPROVED', false);

  -- move userNo link
  UPDATE public.client_binance_usernos
    SET client_id = v_karthik_shetty
    WHERE cp_userno = v_karthik_shetty_uno;

  -- move the 9 KARTHIK SHETTY sales orders off the S KARTHIK card
  UPDATE public.sales_orders so
    SET client_id = v_karthik_shetty, client_name = 'KARTHIK SHETTY'
    FROM public.cp_order_identity coi
    WHERE coi.order_number = so.order_number
      AND coi.cp_userno = v_karthik_shetty_uno
      AND so.client_id = '7dab5dbb-7faa-484b-8289-406424f3185f';

  -- move the verified name (client name matches so trigger allows it)
  UPDATE public.client_verified_names
    SET client_id = v_karthik_shetty
    WHERE client_id = '7dab5dbb-7faa-484b-8289-406424f3185f'
      AND upper(trim(verified_name)) = 'KARTHIK SHETTY';

  -- flip to PENDING now that supporting evidence exists
  UPDATE public.clients
    SET buyer_approval_status = 'PENDING', seller_approval_status = 'PENDING'
    WHERE id = v_karthik_shetty;

  -- surface in the onboarding approval queue
  INSERT INTO public.client_onboarding_approvals
    (client_name, verified_name, order_amount, order_date, approval_status,
     resolved_client_id, sales_order_id, compliance_notes)
  SELECT 'KARTHIK SHETTY', 'KARTHIK SHETTY', so.total_amount, so.order_date, 'PENDING',
     v_karthik_shetty, so.id,
     'Auto-split from contaminated card "S KARTHIK" via authoritative Binance userNo '||v_karthik_shetty_uno
  FROM public.sales_orders so
  WHERE so.client_id = v_karthik_shetty
  ORDER BY so.order_date DESC LIMIT 1;

  ---------------------------------------------------------------------------
  -- B. SONU HAMDEV -> existing client, split off Patel Saurin card
  ---------------------------------------------------------------------------
  UPDATE public.client_binance_usernos
    SET client_id = v_sonu
    WHERE cp_userno = v_sonu_uno;

  UPDATE public.sales_orders so
    SET client_id = v_sonu, client_name = 'SONU HAMDEV'
    FROM public.cp_order_identity coi
    WHERE coi.order_number = so.order_number
      AND coi.cp_userno = v_sonu_uno
      AND so.client_id = '9fbbca26-e82f-4f1f-acd0-a9f77c849ecf';

  INSERT INTO public.client_verified_names (client_id, verified_name, source)
  SELECT v_sonu, 'SONU HAMDEV', 'manual_reconcile'
  WHERE NOT EXISTS (SELECT 1 FROM public.client_verified_names
                    WHERE client_id = v_sonu AND upper(trim(verified_name))='SONU HAMDEV');

  ---------------------------------------------------------------------------
  -- C. ANAND KUMAR DUBEY -> existing client (nickname-collision fix on ANAND M RAJ)
  ---------------------------------------------------------------------------
  UPDATE public.client_binance_usernos
    SET client_id = v_anand_dubey
    WHERE cp_userno = v_dubey_uno;

  ---------------------------------------------------------------------------
  -- D. SADANAND TOPPO -> new distinct client (nickname-collision fix on ANAND M RAJ)
  ---------------------------------------------------------------------------
  v_sadanand := gen_random_uuid();
  INSERT INTO public.clients (id, client_id, name, client_type, date_of_onboarding,
        kyc_status, buyer_approval_status, seller_approval_status, is_deleted)
  VALUES (v_sadanand, upper(substr(md5(random()::text),1,6)), 'SADANAND TOPPO',
        'INDIVIDUAL', CURRENT_DATE, 'PENDING', 'APPROVED', 'APPROVED', false);

  INSERT INTO public.client_verified_names (client_id, verified_name, source)
  VALUES (v_sadanand, 'SADANAND TOPPO', 'manual_reconcile');

  UPDATE public.client_binance_usernos
    SET client_id = v_sadanand
    WHERE cp_userno = v_sadanand_uno;

  UPDATE public.clients
    SET buyer_approval_status = 'PENDING', seller_approval_status = 'PENDING'
    WHERE id = v_sadanand;

  -- log
  RAISE NOTICE 'KARTHIK SHETTY new client %, SADANAND TOPPO new client %', v_karthik_shetty, v_sadanand;
END $$;