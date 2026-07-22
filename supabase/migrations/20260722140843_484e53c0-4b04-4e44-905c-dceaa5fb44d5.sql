CREATE OR REPLACE FUNCTION public.fn_prevent_ghost_pending_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted = true THEN RETURN NEW; END IF;
  IF NEW.buyer_approval_status IS DISTINCT FROM 'PENDING'
     AND NEW.seller_approval_status IS DISTINCT FROM 'PENDING' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.client_onboarding_approvals a
              WHERE a.resolved_client_id = NEW.id
                 OR LOWER(TRIM(a.client_name)) = LOWER(TRIM(NEW.name)))
     OR EXISTS (SELECT 1 FROM public.client_binance_nicknames n WHERE n.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.client_binance_usernos u WHERE u.client_id = NEW.id AND u.is_active = true)
     OR EXISTS (SELECT 1 FROM public.client_verified_names v WHERE v.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.client_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.supplier_name = NEW.name)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot create PENDING client "%" without supporting evidence (approval row, linked nickname, verified name, Binance userNo, or existing order). Insert as APPROVED for manual onboarding, or attach an onboarding approval / order in the same transaction.', NEW.name
    USING ERRCODE = 'check_violation';
END;
$$;