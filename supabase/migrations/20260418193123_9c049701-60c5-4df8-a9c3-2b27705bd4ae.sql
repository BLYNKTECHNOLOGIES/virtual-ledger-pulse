-- A. Add identity columns
ALTER TABLE public.client_onboarding_approvals
  ADD COLUMN IF NOT EXISTS binance_nickname text,
  ADD COLUMN IF NOT EXISTS verified_name text;

CREATE INDEX IF NOT EXISTS idx_coa_binance_nickname
  ON public.client_onboarding_approvals (binance_nickname)
  WHERE binance_nickname IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coa_verified_name
  ON public.client_onboarding_approvals (verified_name)
  WHERE verified_name IS NOT NULL;

-- B. Backfill — disable the blocked-phone trigger temporarily because the existing rows
-- already passed validation when inserted; we are only adding identity metadata.
ALTER TABLE public.client_onboarding_approvals DISABLE TRIGGER USER;

WITH source AS (
  SELECT
    coa.id AS approval_id,
    NULLIF(TRIM(p2p.counterparty_nickname), '') AS nick,
    COALESCE(
      NULLIF(TRIM((tss.order_data->>'verified_name')), ''),
      NULLIF(TRIM(boh.verified_name), '')
    ) AS vname
  FROM public.client_onboarding_approvals coa
  LEFT JOIN public.terminal_sales_sync tss ON tss.sales_order_id = coa.sales_order_id
  LEFT JOIN public.p2p_order_records p2p ON p2p.binance_order_number = tss.binance_order_number
  LEFT JOIN public.binance_order_history boh ON boh.order_number = tss.binance_order_number
  WHERE coa.binance_nickname IS NULL OR coa.verified_name IS NULL
)
UPDATE public.client_onboarding_approvals coa
SET
  binance_nickname = COALESCE(coa.binance_nickname,
    CASE WHEN source.nick IS NOT NULL AND source.nick NOT LIKE '%*%' THEN source.nick END),
  verified_name = COALESCE(coa.verified_name, source.vname)
FROM source
WHERE source.approval_id = coa.id
  AND (source.nick IS NOT NULL OR source.vname IS NOT NULL);

ALTER TABLE public.client_onboarding_approvals ENABLE TRIGGER USER;

-- C. Update trigger to populate identity on new approvals
CREATE OR REPLACE FUNCTION public.create_client_onboarding_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_binance_order_number text;
  v_nickname text;
  v_verified_name text;
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    IF NEW.client_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
        RETURN NEW;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND (
            LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
            OR (NEW.client_phone IS NOT NULL AND NEW.client_phone != ''
                AND client_phone IS NOT DISTINCT FROM NEW.client_phone)
          )
      ) THEN
        RETURN NEW;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name))) THEN
        RETURN NEW;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.client_onboarding_approvals
        WHERE approval_status IN ('PENDING', 'APPROVED')
          AND LOWER(TRIM(client_name)) = LOWER(TRIM(NEW.client_name))
      ) THEN
        RETURN NEW;
      END IF;
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

    INSERT INTO public.client_onboarding_approvals (
      sales_order_id, client_name, client_phone,
      order_amount, order_date,
      binance_nickname, verified_name
    ) VALUES (
      NEW.id, NEW.client_name, NEW.client_phone,
      NEW.total_amount, NEW.order_date,
      v_nickname, v_verified_name
    );
  END IF;
  RETURN NEW;
END;
$$;