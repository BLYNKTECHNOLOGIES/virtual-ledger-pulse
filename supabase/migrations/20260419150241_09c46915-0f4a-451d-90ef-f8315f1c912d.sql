-- 1) Column
ALTER TABLE public.client_onboarding_approvals
  ADD COLUMN IF NOT EXISTS resolved_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coa_resolved_client_id
  ON public.client_onboarding_approvals (resolved_client_id)
  WHERE resolved_client_id IS NOT NULL;

-- 2) Trigger function
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

    IF v_binance_order_number IS NOT NULL THEN
      SELECT NULLIF(TRIM(p2p.counterparty_nickname), '')
        INTO v_nickname
      FROM public.p2p_order_records p2p
      WHERE p2p.binance_order_number = v_binance_order_number
        AND p2p.counterparty_nickname IS NOT NULL
        AND p2p.counterparty_nickname NOT LIKE '%*%'
      LIMIT 1;
    END IF;

    IF v_nickname IS NOT NULL AND v_nickname NOT LIKE '%*%' THEN
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

    IF v_resolved_client_id IS NULL THEN
      SELECT id INTO v_resolved_client_id
      FROM public.clients
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))
        AND is_deleted = false
      LIMIT 1;
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
          OR LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
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

-- 3) Backfill (disable user triggers — these rows already passed validation when first inserted)
ALTER TABLE public.client_onboarding_approvals DISABLE TRIGGER USER;

DO $$
DECLARE
  r RECORD;
  v_rid uuid;
  v_count integer;
BEGIN
  FOR r IN
    SELECT id, client_name, client_phone, binance_nickname, verified_name
    FROM public.client_onboarding_approvals
    WHERE approval_status = 'PENDING' AND resolved_client_id IS NULL
  LOOP
    v_rid := NULL;

    IF r.binance_nickname IS NOT NULL AND r.binance_nickname NOT LIKE '%*%' THEN
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

    IF v_rid IS NULL THEN
      SELECT id INTO v_rid
      FROM public.clients
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.client_name)) AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_rid IS NULL AND r.client_phone IS NOT NULL AND r.client_phone <> '' THEN
      SELECT id INTO v_rid
      FROM public.clients
      WHERE phone = r.client_phone AND is_deleted = false
      LIMIT 1;
    END IF;

    IF v_rid IS NOT NULL THEN
      UPDATE public.client_onboarding_approvals
      SET resolved_client_id = v_rid
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 4) Auto-clear noise
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