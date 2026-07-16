
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
  v_resolved_name text;
  v_resolved_orders int;
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    -- Already linked to a live client → nothing to onboard.
    IF NEW.client_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id AND is_deleted = false) THEN
      RETURN NEW;
    END IF;

    SELECT tss.binance_order_number,
           COALESCE(NULLIF(TRIM((tss.order_data->>'verified_name')), ''),
                    NULLIF(TRIM(boh.verified_name), ''))
      INTO v_binance_order_number, v_verified_name
    FROM public.terminal_sales_sync tss
    LEFT JOIN public.binance_order_history boh ON boh.order_number = tss.binance_order_number
    WHERE tss.sales_order_id = NEW.id
    LIMIT 1;

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
    END IF;

    -- USERNO-FIRST PATH: resolve client_id from userNo.
    IF v_cp_userno IS NOT NULL THEN
      SELECT bu.client_id, c.name,
             (SELECT COUNT(*) FROM public.sales_orders so WHERE so.client_id = c.id)
        INTO v_resolved_client_id, v_resolved_name, v_resolved_orders
      FROM public.client_binance_usernos bu
      JOIN public.clients c ON c.id = bu.client_id
      WHERE bu.cp_userno = v_cp_userno
        AND bu.is_active = true
        AND c.is_deleted = false
      LIMIT 1;

      -- Ghost-client guard.
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

    -- LEGACY nickname resolve (only if userNo path did not resolve).
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

    -- UNIFIED DEDUP GATE — the fix.
    -- Skip creating a new approval if ANY of these are already true:
    --   (a) resolved client has ANY prior APPROVED approval, OR
    --   (b) resolved client's buyer_approval_status is APPROVED, OR
    --   (c) same cp_userno already has a PENDING/APPROVED approval, OR
    --   (d) same nickname already has a PENDING/APPROVED approval, OR
    --   (e) same sales_order_id already has a PENDING/APPROVED approval.
    IF v_resolved_client_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.client_onboarding_approvals
         WHERE resolved_client_id = v_resolved_client_id
           AND approval_status = 'APPROVED'
       ) THEN
      RETURN NEW;
    END IF;

    IF v_resolved_client_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.clients
         WHERE id = v_resolved_client_id AND buyer_approval_status = 'APPROVED'
       ) THEN
      RETURN NEW;
    END IF;

    IF v_cp_userno IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.client_onboarding_approvals
         WHERE cp_userno = v_cp_userno
           AND approval_status IN ('PENDING','APPROVED')
       ) THEN
      RETURN NEW;
    END IF;

    IF v_nickname IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.client_onboarding_approvals
         WHERE binance_nickname = v_nickname
           AND approval_status IN ('PENDING','APPROVED')
       ) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
         SELECT 1 FROM public.client_onboarding_approvals
         WHERE sales_order_id = NEW.id
           AND approval_status IN ('PENDING','APPROVED')
       ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.client_onboarding_approvals (
      sales_order_id, client_name, client_phone,
      order_amount, order_date,
      binance_nickname, verified_name, resolved_client_id, cp_userno
    ) VALUES (
      NEW.id, COALESCE(v_verified_name, NEW.client_name), NEW.client_phone,
      NEW.total_amount, NEW.order_date,
      v_nickname, v_verified_name, v_resolved_client_id, v_cp_userno
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Clean up existing duplicates: auto-approve any PENDING row whose resolved
-- client or nickname already has an APPROVED sibling.
UPDATE public.client_onboarding_approvals coa
SET approval_status = 'APPROVED',
    reviewed_at = now(),
    compliance_notes = COALESCE(compliance_notes,'') ||
      E'\n[Auto-resolved 2026-07-16] Duplicate of prior APPROVED onboarding for the same client/nickname.'
WHERE coa.approval_status = 'PENDING'
  AND (
    (coa.resolved_client_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals x
       WHERE x.resolved_client_id = coa.resolved_client_id
         AND x.approval_status = 'APPROVED'
         AND x.id <> coa.id))
    OR
    (coa.binance_nickname IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_onboarding_approvals x
       WHERE x.binance_nickname = coa.binance_nickname
         AND x.approval_status = 'APPROVED'
         AND x.id <> coa.id))
  );
