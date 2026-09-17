-- Root cause: onboarding approvals were only created by an AFTER UPDATE trigger
-- (status transition to COMPLETED). Terminal-synced sales orders are INSERTED
-- already COMPLETED, so no approval row was ever created for them and the client
-- never appeared in ERP. Extract the logic into a reusable, idempotent function
-- and fire it on INSERT as well as UPDATE.

CREATE OR REPLACE FUNCTION public.ensure_client_onboarding_approval(p_sales_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  so RECORD;
  v_binance_order_number text;
  v_nickname text;
  v_verified_name text;
  v_cp_userno text;
  v_resolved_client_id uuid;
  v_resolved_name text;
  v_resolved_orders int;
BEGIN
  SELECT * INTO so FROM public.sales_orders WHERE id = p_sales_order_id;
  IF so.id IS NULL OR so.status <> 'COMPLETED' THEN
    RETURN;
  END IF;

  IF so.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clients WHERE id = so.client_id AND is_deleted = false) THEN
    RETURN;
  END IF;

  SELECT tss.binance_order_number,
         COALESCE(NULLIF(TRIM((tss.order_data->>'verified_name')), ''),
                  NULLIF(TRIM(boh.verified_name), ''))
    INTO v_binance_order_number, v_verified_name
  FROM public.terminal_sales_sync tss
  LEFT JOIN public.binance_order_history boh ON boh.order_number = tss.binance_order_number
  WHERE tss.sales_order_id = so.id
  LIMIT 1;

  -- Terminal order numbers are also embedded in the ERP order number
  -- (SO-TRM-<binance order number>) — use that when no sync row is present.
  IF v_binance_order_number IS NULL AND so.order_number LIKE 'SO-TRM-%' THEN
    v_binance_order_number := substr(so.order_number, 8);
    SELECT NULLIF(TRIM(boh.verified_name), '')
      INTO v_verified_name
    FROM public.binance_order_history boh
    WHERE boh.order_number = v_binance_order_number
    LIMIT 1;
  END IF;

  IF v_verified_name IS NOT NULL AND (LOWER(v_verified_name) = 'unknown' OR v_verified_name LIKE '%*%') THEN
    v_verified_name := NULL;
  END IF;

  IF v_binance_order_number IS NOT NULL THEN
    SELECT NULLIF(TRIM(oi.cp_userno), '')
      INTO v_cp_userno
    FROM public.cp_order_identity oi
    WHERE oi.order_number = v_binance_order_number
      AND oi.cp_userno IS NOT NULL
    LIMIT 1;

    SELECT NULLIF(TRIM(p2p.counterparty_nickname), '')
      INTO v_nickname
    FROM public.p2p_order_records p2p
    WHERE p2p.binance_order_number = v_binance_order_number
      AND p2p.counterparty_nickname IS NOT NULL
      AND p2p.counterparty_nickname NOT LIKE '%*%'
      AND LOWER(TRIM(p2p.counterparty_nickname)) <> 'unknown'
      AND TRIM(p2p.counterparty_nickname) <> ''
    LIMIT 1;

    IF v_nickname IS NULL THEN
      SELECT NULLIF(TRIM(boh.counter_part_nick_name), '')
        INTO v_nickname
      FROM public.binance_order_history boh
      WHERE boh.order_number = v_binance_order_number
        AND boh.counter_part_nick_name IS NOT NULL
        AND boh.counter_part_nick_name NOT LIKE '%*%'
        AND LOWER(TRIM(boh.counter_part_nick_name)) <> 'unknown'
      LIMIT 1;
    END IF;
  END IF;

  IF v_cp_userno IS NOT NULL THEN
    SELECT bu.client_id, c.name,
           (SELECT COUNT(*) FROM public.sales_orders s2 WHERE s2.client_id = c.id)
      INTO v_resolved_client_id, v_resolved_name, v_resolved_orders
    FROM public.client_binance_usernos bu
    JOIN public.clients c ON c.id = bu.client_id
    WHERE bu.cp_userno = v_cp_userno
      AND bu.is_active = true
      AND c.is_deleted = false
    LIMIT 1;

    IF v_resolved_client_id IS NOT NULL
       AND v_resolved_name ~ ' • User-'
       AND v_resolved_orders = 0 THEN
      UPDATE public.client_binance_usernos
        SET is_active = false
        WHERE cp_userno = v_cp_userno AND client_id = v_resolved_client_id;
      UPDATE public.clients SET is_deleted = true WHERE id = v_resolved_client_id;
      v_resolved_client_id := NULL;
    END IF;
  END IF;

  IF v_resolved_client_id IS NULL AND v_nickname IS NOT NULL THEN
    SELECT bn.client_id INTO v_resolved_client_id
    FROM public.client_binance_nicknames bn
    JOIN public.clients c ON c.id = bn.client_id
    WHERE bn.nickname = v_nickname
      AND bn.is_active = true
      AND c.is_deleted = false
      AND c.name !~ ' • User-'
    LIMIT 1;
  END IF;

  -- Dedup gates (unchanged semantics).
  IF v_resolved_client_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals
       WHERE resolved_client_id = v_resolved_client_id AND approval_status = 'APPROVED') THEN
    RETURN;
  END IF;

  IF v_resolved_client_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.clients
       WHERE id = v_resolved_client_id AND buyer_approval_status = 'APPROVED') THEN
    RETURN;
  END IF;

  IF v_cp_userno IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals
       WHERE cp_userno = v_cp_userno AND approval_status IN ('PENDING','APPROVED')) THEN
    RETURN;
  END IF;

  IF v_nickname IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals
       WHERE binance_nickname = v_nickname AND approval_status IN ('PENDING','APPROVED')) THEN
    RETURN;
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals
       WHERE sales_order_id = so.id AND approval_status IN ('PENDING','APPROVED')) THEN
    RETURN;
  END IF;

  INSERT INTO public.client_onboarding_approvals (
    sales_order_id, client_name, client_phone,
    order_amount, order_date,
    binance_nickname, verified_name, resolved_client_id, cp_userno
  ) VALUES (
    so.id, COALESCE(v_verified_name, so.client_name), so.client_phone,
    so.total_amount, so.order_date,
    v_nickname, v_verified_name, v_resolved_client_id, v_cp_userno
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_client_onboarding_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_client_onboarding_approval(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'COMPLETED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    PERFORM public.ensure_client_onboarding_approval(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_create_client_onboarding_approval ON public.sales_orders;
CREATE TRIGGER trigger_create_client_onboarding_approval
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.create_client_onboarding_approval();