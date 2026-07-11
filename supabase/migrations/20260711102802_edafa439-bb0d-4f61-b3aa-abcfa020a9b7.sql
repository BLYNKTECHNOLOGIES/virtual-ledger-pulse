-- 1) Add userNo column to onboarding approvals so identity is keyed on the
--    stable, globally-unique Binance account id (cp_userno), not on name.
ALTER TABLE public.client_onboarding_approvals
  ADD COLUMN IF NOT EXISTS cp_userno text;

CREATE INDEX IF NOT EXISTS idx_coa_cp_userno
  ON public.client_onboarding_approvals (cp_userno)
  WHERE cp_userno IS NOT NULL;

-- 2) Rewrite the approval-creation trigger to be userNo-first.
--    Root cause of the name-welding: the old logic resolved and de-duplicated on
--    verified_name / nickname / name, so a genuinely different person who shared
--    a verified name with an existing client was silently collapsed into that
--    client and never got their own approval. We now treat the order's cp_userno
--    as the source of truth. Name-based resolution is used ONLY as a legacy
--    fallback when the order carries no userNo signal.
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_binance_order_number text;
  v_nickname text;
  v_verified_name text;
  v_cp_userno text;
  v_resolved_client_id uuid;
  v_vname_count integer;
  v_buyer_status text;
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    IF NEW.client_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
      RETURN NEW;
    END IF;

    -- Resolve the Binance order number + verified name for this sales order.
    SELECT tss.binance_order_number,
           COALESCE(NULLIF(TRIM((tss.order_data->>'verified_name')), ''),
                    NULLIF(TRIM(boh.verified_name), ''))
      INTO v_binance_order_number, v_verified_name
    FROM public.terminal_sales_sync tss
    LEFT JOIN public.binance_order_history boh ON boh.order_number = tss.binance_order_number
    WHERE tss.sales_order_id = NEW.id
    LIMIT 1;

    -- Reject sentinels (Unknown, masked '*', empty)
    IF v_verified_name IS NOT NULL AND (LOWER(v_verified_name) = 'unknown' OR v_verified_name LIKE '%*%') THEN
      v_verified_name := NULL;
    END IF;

    -- Authoritative identity: the order's Binance userNo.
    IF v_binance_order_number IS NOT NULL THEN
      SELECT NULLIF(TRIM(oi.cp_userno), '')
        INTO v_cp_userno
      FROM public.cp_order_identity oi
      WHERE oi.order_number = v_binance_order_number
        AND oi.cp_userno IS NOT NULL
      LIMIT 1;
    END IF;

    -- Resolve a real (unmasked) nickname for display / legacy fallback.
    IF v_binance_order_number IS NOT NULL THEN
      SELECT NULLIF(TRIM(p2p.counterparty_nickname), '')
        INTO v_nickname
      FROM public.p2p_order_records p2p
      WHERE p2p.binance_order_number = v_binance_order_number
        AND p2p.counterparty_nickname IS NOT NULL
        AND p2p.counterparty_nickname NOT LIKE '%*%'
        AND LOWER(TRIM(p2p.counterparty_nickname)) <> 'unknown'
        AND TRIM(p2p.counterparty_nickname) <> ''
      LIMIT 1;
    END IF;
    IF v_nickname IS NOT NULL AND (LOWER(v_nickname) = 'unknown' OR v_nickname LIKE '%*%' OR TRIM(v_nickname) = '') THEN
      v_nickname := NULL;
    END IF;

    -- =====================================================================
    -- USERNO-FIRST PATH (authoritative). When the order carries a userNo,
    -- identity is decided strictly by userNo — never by name.
    -- =====================================================================
    IF v_cp_userno IS NOT NULL THEN
      -- Does this userNo already belong to a live client?
      SELECT bu.client_id INTO v_resolved_client_id
      FROM public.client_binance_usernos bu
      JOIN public.clients c ON c.id = bu.client_id
      WHERE bu.cp_userno = v_cp_userno
        AND bu.is_active = true
        AND c.is_deleted = false
      LIMIT 1;

      -- Already an approved buyer -> nothing to do.
      IF v_resolved_client_id IS NOT NULL THEN
        SELECT buyer_approval_status INTO v_buyer_status
        FROM public.clients WHERE id = v_resolved_client_id;
        IF v_buyer_status = 'APPROVED' THEN
          RETURN NEW;
        END IF;
      END IF;

      -- De-dup strictly on userNo: one pending/approved approval per userNo.
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING','APPROVED')
          AND cp_userno IS NOT DISTINCT FROM v_cp_userno
      ) THEN
        RETURN NEW;
      END IF;

      INSERT INTO public.client_onboarding_approvals (
        sales_order_id, client_name, client_phone,
        order_amount, order_date,
        binance_nickname, verified_name, resolved_client_id, cp_userno
      ) VALUES (
        NEW.id, NEW.client_name, NEW.client_phone,
        NEW.total_amount, NEW.order_date,
        v_nickname, v_verified_name, v_resolved_client_id, v_cp_userno
      );
      RETURN NEW;
    END IF;

    -- =====================================================================
    -- LEGACY FALLBACK PATH (no userNo signal on the order). Kept intact so
    -- historical / non-terminal orders behave as before and do not inflate
    -- the pending ledger. Name signals are used ONLY here.
    -- =====================================================================
    IF v_nickname IS NOT NULL THEN
      SELECT cbn.client_id INTO v_resolved_client_id
      FROM public.client_binance_nicknames cbn
      JOIN public.clients c ON c.id = cbn.client_id
      WHERE cbn.nickname = v_nickname
        AND cbn.is_active = true
        AND c.is_deleted = false
      LIMIT 1;
    END IF;

    IF v_resolved_client_id IS NULL AND v_verified_name IS NOT NULL THEN
      SELECT COUNT(DISTINCT cvn.client_id) INTO v_vname_count
      FROM public.client_verified_names cvn
      JOIN public.clients c ON c.id = cvn.client_id
      WHERE cvn.verified_name = v_verified_name AND c.is_deleted = false;
      IF v_vname_count = 1 THEN
        SELECT cvn.client_id INTO v_resolved_client_id
        FROM public.client_verified_names cvn
        JOIN public.clients c ON c.id = cvn.client_id
        WHERE cvn.verified_name = v_verified_name AND c.is_deleted = false
        LIMIT 1;
      END IF;
    END IF;

    IF v_resolved_client_id IS NULL AND NEW.client_phone IS NOT NULL AND NEW.client_phone <> '' THEN
      SELECT id INTO v_resolved_client_id
      FROM public.clients
      WHERE phone = NEW.client_phone AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_resolved_client_id IS NOT NULL THEN
      SELECT buyer_approval_status INTO v_buyer_status
      FROM public.clients WHERE id = v_resolved_client_id;
      IF v_buyer_status = 'APPROVED' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.client_onboarding_approvals
      WHERE approval_status IN ('PENDING','APPROVED')
        AND (
          (v_resolved_client_id IS NOT NULL AND resolved_client_id = v_resolved_client_id)
          OR (NEW.client_phone IS NOT NULL AND NEW.client_phone <> ''
              AND client_phone IS NOT DISTINCT FROM NEW.client_phone)
          OR (v_nickname IS NOT NULL
              AND binance_nickname IS NOT DISTINCT FROM v_nickname)
          OR (v_nickname IS NULL AND v_resolved_client_id IS NULL
              AND (NEW.client_phone IS NULL OR NEW.client_phone = '')
              AND v_verified_name IS NOT NULL
              AND verified_name IS NOT DISTINCT FROM v_verified_name)
          OR (v_nickname IS NULL AND v_resolved_client_id IS NULL
              AND v_verified_name IS NULL
              AND (NEW.client_phone IS NULL OR NEW.client_phone = '')
              AND NEW.client_name IS NOT NULL AND TRIM(NEW.client_name) <> ''
              AND LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name)))
        )
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.client_onboarding_approvals (
      sales_order_id, client_name, client_phone,
      order_amount, order_date,
      binance_nickname, verified_name, resolved_client_id
    ) VALUES (
      NEW.id, NEW.client_name, NEW.client_phone,
      NEW.total_amount, NEW.order_date,
      v_nickname, v_verified_name, v_resolved_client_id
    );
  END IF;
  RETURN NEW;
END;
$function$;