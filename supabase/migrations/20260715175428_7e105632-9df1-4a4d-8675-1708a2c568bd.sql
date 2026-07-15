
-- =====================================================================
-- 1. Block any future creation/rename of "NAME • User-XXXXX" clients
-- =====================================================================
CREATE OR REPLACE FUNCTION public.block_synthetic_ghost_client_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.name ~ ' • User-' THEN
    RAISE EXCEPTION 'Refusing to create/rename client with synthetic "NAME • User-XXXXX" label (%). Use a real KYC name or leave the Binance nickname on the mapping table.', NEW.name
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_synthetic_ghost_client_name ON public.clients;
CREATE TRIGGER trg_block_synthetic_ghost_client_name
BEFORE INSERT OR UPDATE OF name ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.block_synthetic_ghost_client_name();

-- =====================================================================
-- 2. Approval trigger: refuse to inherit identity from a ghost client
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_binance_order_number text;
  v_nickname text;
  v_verified_name text;
  v_cp_userno text;
  v_resolved_client_id uuid;
  v_resolved_name text;
  v_resolved_orders int;
  v_buyer_status text;
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
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

    -- USERNO-FIRST PATH
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

      -- Ghost-client guard: if resolved client is a synthetic "NAME • User-XXXX"
      -- with zero real orders, ignore the mapping and detach it so this order
      -- rebinds to a real identity via the verified name captured below.
      IF v_resolved_client_id IS NOT NULL
         AND v_resolved_name ~ ' • User-'
         AND v_resolved_orders = 0 THEN
        UPDATE public.client_binance_usernos
          SET is_active = false
          WHERE cp_userno = v_cp_userno AND client_id = v_resolved_client_id;
        UPDATE public.clients SET is_deleted = true WHERE id = v_resolved_client_id;
        v_resolved_client_id := NULL;
      END IF;

      IF v_resolved_client_id IS NOT NULL THEN
        SELECT buyer_approval_status INTO v_buyer_status FROM public.clients WHERE id = v_resolved_client_id;
        IF v_buyer_status = 'APPROVED' THEN
          RETURN NEW;
        END IF;
      END IF;

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
        NEW.id, COALESCE(v_verified_name, NEW.client_name), NEW.client_phone,
        NEW.total_amount, NEW.order_date,
        v_nickname, v_verified_name, v_resolved_client_id, v_cp_userno
      );
      RETURN NEW;
    END IF;

    -- LEGACY FALLBACK (no userNo) — kept exactly as before.
    IF v_nickname IS NOT NULL THEN
      SELECT bn.client_id INTO v_resolved_client_id
      FROM public.client_binance_nicknames bn
      JOIN public.clients c ON c.id = bn.client_id
      WHERE bn.nickname = v_nickname
        AND bn.is_active = true
        AND c.is_deleted = false
        AND c.name !~ ' • User-'    -- never match a ghost via nickname either
      LIMIT 1;
    END IF;

    IF v_resolved_client_id IS NOT NULL THEN
      SELECT buyer_approval_status INTO v_buyer_status FROM public.clients WHERE id = v_resolved_client_id;
      IF v_buyer_status = 'APPROVED' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.client_onboarding_approvals
      WHERE approval_status IN ('PENDING','APPROVED')
        AND sales_order_id = NEW.id
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
      v_nickname, v_verified_name, v_resolved_client_id, NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 3. Recurring cleanup helper (idempotent) — retires ghost clients with 0 orders
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cleanup_ghost_synthetic_clients()
RETURNS TABLE(retired_client_id uuid, retired_name text)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH targets AS (
    SELECT c.id, c.name
    FROM public.clients c
    WHERE c.name ~ ' • User-'
      AND c.is_deleted = false
      AND NOT EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.client_id = c.id)
  ),
  detach_unos AS (
    UPDATE public.client_binance_usernos u SET is_active = false
    WHERE u.client_id IN (SELECT id FROM targets) AND u.is_active
    RETURNING u.client_id
  ),
  detach_nicks AS (
    DELETE FROM public.client_binance_nicknames
    WHERE client_id IN (SELECT id FROM targets)
    RETURNING client_id
  ),
  reject_appr AS (
    UPDATE public.client_onboarding_approvals
      SET approval_status = 'REJECTED',
          rejection_reason = COALESCE(rejection_reason, 'Auto-cleanup: ghost synthetic client retired.'),
          reviewed_at = now(),
          updated_at = now()
    WHERE resolved_client_id IN (SELECT id FROM targets)
      AND approval_status = 'PENDING'
    RETURNING resolved_client_id
  ),
  soft_delete AS (
    UPDATE public.clients c
      SET is_deleted = true, updated_at = now()
    WHERE c.id IN (SELECT id FROM targets)
    RETURNING c.id, c.name
  )
  SELECT id, name FROM soft_delete;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ghost_synthetic_clients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ghost_synthetic_clients() TO service_role;

-- =====================================================================
-- 4. Run the cleanup immediately for the 27 already-live ghosts
-- =====================================================================
SELECT public.cleanup_ghost_synthetic_clients();
