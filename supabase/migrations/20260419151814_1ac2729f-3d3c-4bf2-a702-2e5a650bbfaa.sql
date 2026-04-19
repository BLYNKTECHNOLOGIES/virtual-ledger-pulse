-- 1) Replace trigger function — strict sentinel rejection
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_binance_order_number text;
  v_nickname text;
  v_verified_name text;
  v_resolved_client_id uuid;
  v_vname_count integer;
  v_buyer_status text;
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    IF NEW.client_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
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

    -- Reject sentinels (Unknown, masked '*', empty)
    IF v_verified_name IS NOT NULL AND (LOWER(v_verified_name) = 'unknown' OR v_verified_name LIKE '%*%') THEN
      v_verified_name := NULL;
    END IF;

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

    -- Final guard
    IF v_nickname IS NOT NULL AND (LOWER(v_nickname) = 'unknown' OR v_nickname LIKE '%*%' OR TRIM(v_nickname) = '') THEN
      v_nickname := NULL;
    END IF;

    -- Resolution: nickname (only if real)
    IF v_nickname IS NOT NULL THEN
      SELECT cbn.client_id INTO v_resolved_client_id
      FROM public.client_binance_nicknames cbn
      JOIN public.clients c ON c.id = cbn.client_id
      WHERE cbn.nickname = v_nickname
        AND cbn.is_active = true
        AND c.is_deleted = false
      LIMIT 1;
    END IF;

    -- Verified name (single-match only)
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

    -- Phone (strong signal — checked BEFORE name to avoid name-collision merges)
    IF v_resolved_client_id IS NULL AND NEW.client_phone IS NOT NULL AND NEW.client_phone <> '' THEN
      SELECT id INTO v_resolved_client_id
      FROM public.clients
      WHERE phone = NEW.client_phone AND is_deleted = false
      LIMIT 1;
    END IF;

    -- Compound: exact name + phone (already covered above when phone matched).
    -- Plain name match alone is unsafe — skip; let it become a true New Client.

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
$$;

-- 2) Validation trigger — reject sentinels at insert/update on client_binance_nicknames
CREATE OR REPLACE FUNCTION public.validate_binance_nickname_not_sentinel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nickname IS NULL
     OR TRIM(NEW.nickname) = ''
     OR LOWER(TRIM(NEW.nickname)) = 'unknown'
     OR NEW.nickname LIKE '%*%' THEN
    RAISE EXCEPTION 'Sentinel nickname rejected: "%"', NEW.nickname
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_binance_nickname_not_sentinel ON public.client_binance_nicknames;
CREATE TRIGGER trg_validate_binance_nickname_not_sentinel
  BEFORE INSERT OR UPDATE ON public.client_binance_nicknames
  FOR EACH ROW EXECUTE FUNCTION public.validate_binance_nickname_not_sentinel();

-- 3) One-time cleanup — disable user triggers so the validation trigger doesn't block our cleanup
ALTER TABLE public.client_binance_nicknames DISABLE TRIGGER USER;
UPDATE public.client_binance_nicknames
SET is_active = false
WHERE nickname IS NULL
   OR TRIM(nickname) = ''
   OR LOWER(TRIM(nickname)) = 'unknown'
   OR nickname LIKE '%*%';
ALTER TABLE public.client_binance_nicknames ENABLE TRIGGER USER;

ALTER TABLE public.client_onboarding_approvals DISABLE TRIGGER USER;
UPDATE public.client_onboarding_approvals
SET binance_nickname = NULL
WHERE binance_nickname IS NOT NULL
  AND (TRIM(binance_nickname) = ''
       OR LOWER(TRIM(binance_nickname)) = 'unknown'
       OR binance_nickname LIKE '%*%');

UPDATE public.client_onboarding_approvals
SET verified_name = NULL
WHERE verified_name IS NOT NULL
  AND (TRIM(verified_name) = ''
       OR LOWER(TRIM(verified_name)) = 'unknown'
       OR verified_name LIKE '%*%');

-- 4) Re-run resolved_client_id backfill for all PENDING rows (clears bad links AND re-resolves)
DO $$
DECLARE
  r RECORD;
  v_rid uuid;
  v_count integer;
BEGIN
  FOR r IN
    SELECT id, client_name, client_phone, binance_nickname, verified_name
    FROM public.client_onboarding_approvals
    WHERE approval_status = 'PENDING'
  LOOP
    v_rid := NULL;

    IF r.binance_nickname IS NOT NULL
       AND r.binance_nickname NOT LIKE '%*%'
       AND LOWER(TRIM(r.binance_nickname)) <> 'unknown'
       AND TRIM(r.binance_nickname) <> '' THEN
      SELECT cbn.client_id INTO v_rid
      FROM public.client_binance_nicknames cbn
      JOIN public.clients c ON c.id = cbn.client_id
      WHERE cbn.nickname = r.binance_nickname
        AND cbn.is_active = true AND c.is_deleted = false
      LIMIT 1;
    END IF;

    IF v_rid IS NULL AND r.verified_name IS NOT NULL THEN
      SELECT COUNT(DISTINCT cvn.client_id) INTO v_count
      FROM public.client_verified_names cvn
      JOIN public.clients c ON c.id = cvn.client_id
      WHERE cvn.verified_name = r.verified_name AND c.is_deleted = false;
      IF v_count = 1 THEN
        SELECT cvn.client_id INTO v_rid
        FROM public.client_verified_names cvn
        JOIN public.clients c ON c.id = cvn.client_id
        WHERE cvn.verified_name = r.verified_name AND c.is_deleted = false
        LIMIT 1;
      END IF;
    END IF;

    IF v_rid IS NULL AND r.client_phone IS NOT NULL AND r.client_phone <> '' THEN
      SELECT id INTO v_rid
      FROM public.clients
      WHERE phone = r.client_phone AND is_deleted = false
      LIMIT 1;
    END IF;

    -- Always update (set NULL if no resolution found, clearing stale links)
    UPDATE public.client_onboarding_approvals
    SET resolved_client_id = v_rid
    WHERE id = r.id;
  END LOOP;
END $$;

-- 5) Auto-clear noise (resolved client already buyer-approved)
UPDATE public.client_onboarding_approvals coa
SET approval_status = 'APPROVED',
    reviewed_at = COALESCE(coa.reviewed_at, now()),
    compliance_notes = COALESCE(coa.compliance_notes, '')
      || E'\n[auto-cleared: client already buyer-approved]'
FROM public.clients c
WHERE coa.resolved_client_id = c.id
  AND coa.approval_status = 'PENDING'
  AND c.buyer_approval_status = 'APPROVED';

ALTER TABLE public.client_onboarding_approvals ENABLE TRIGGER USER;