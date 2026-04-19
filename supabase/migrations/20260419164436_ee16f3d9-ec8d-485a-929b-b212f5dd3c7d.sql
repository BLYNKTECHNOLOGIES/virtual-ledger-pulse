-- =========================================================================
-- 1. CLEANUP: client_verified_names — drop rows with no supporting evidence
-- A row is kept only if:
--   (a) verified_name matches the client's clients.name (case-insensitive), OR
--   (b) verified_name appears in at least one binance_order_history row
--       whose counter_part_nick_name is linked to that client via
--       client_binance_nicknames.
-- =========================================================================
WITH evidence AS (
  SELECT cvn.id
  FROM public.client_verified_names cvn
  JOIN public.clients c ON c.id = cvn.client_id
  WHERE
    -- (a) name match
    LOWER(TRIM(cvn.verified_name)) = LOWER(TRIM(c.name))
    OR
    -- (b) order-backed evidence via linked nickname
    EXISTS (
      SELECT 1
      FROM public.client_binance_nicknames cbn
      JOIN public.binance_order_history boh
        ON boh.counter_part_nick_name = cbn.nickname
      WHERE cbn.client_id = cvn.client_id
        AND cbn.is_active = true
        AND LOWER(TRIM(boh.verified_name)) = LOWER(TRIM(cvn.verified_name))
    )
)
DELETE FROM public.client_verified_names
WHERE id NOT IN (SELECT id FROM evidence);

-- =========================================================================
-- 2. CLEANUP: client_binance_nicknames — drop rows with no order evidence
-- Keep a (client_id, nickname) link only if at least one order in
-- binance_order_history has that counterparty nickname AND the order's
-- verified_name matches either the client's name OR an existing verified
-- name still attached to the client (after step 1).
-- We are CONSERVATIVE here: if there are zero orders with that nickname at
-- all, we leave it alone (could be from a manual link or terminal sync
-- where the order row is older than retention) — only delete when orders
-- exist that actively contradict the link.
-- =========================================================================
WITH contradicted AS (
  SELECT cbn.id
  FROM public.client_binance_nicknames cbn
  JOIN public.clients c ON c.id = cbn.client_id
  WHERE EXISTS (
    SELECT 1 FROM public.binance_order_history boh
    WHERE boh.counter_part_nick_name = cbn.nickname
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.binance_order_history boh
    WHERE boh.counter_part_nick_name = cbn.nickname
      AND (
        LOWER(TRIM(COALESCE(boh.verified_name,''))) = LOWER(TRIM(c.name))
        OR EXISTS (
          SELECT 1 FROM public.client_verified_names cvn
          WHERE cvn.client_id = cbn.client_id
            AND LOWER(TRIM(cvn.verified_name)) = LOWER(TRIM(COALESCE(boh.verified_name,'')))
        )
      )
  )
)
DELETE FROM public.client_binance_nicknames
WHERE id IN (SELECT id FROM contradicted);

-- =========================================================================
-- 3. GUARD: trg_validate_verified_name_attachment
-- Block INSERT/UPDATE on client_verified_names unless ONE of:
--   (a) verified_name matches client.name (case-insensitive), OR
--   (b) the same (client_id, verified_name) already exists, OR
--   (c) at least one binance_order_history row exists where
--       counter_part_nick_name is linked to that client AND
--       boh.verified_name = NEW.verified_name.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.validate_verified_name_attachment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_exists BOOLEAN;
BEGIN
  -- (a) client name match
  SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  IF v_client_name IS NOT NULL
     AND LOWER(TRIM(v_client_name)) = LOWER(TRIM(NEW.verified_name)) THEN
    RETURN NEW;
  END IF;

  -- (b) already attached
  SELECT EXISTS(
    SELECT 1 FROM public.client_verified_names
    WHERE client_id = NEW.client_id
      AND LOWER(TRIM(verified_name)) = LOWER(TRIM(NEW.verified_name))
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  -- (c) order-backed via linked nickname
  SELECT EXISTS(
    SELECT 1
    FROM public.client_binance_nicknames cbn
    JOIN public.binance_order_history boh
      ON boh.counter_part_nick_name = cbn.nickname
    WHERE cbn.client_id = NEW.client_id
      AND cbn.is_active = true
      AND LOWER(TRIM(COALESCE(boh.verified_name,''))) = LOWER(TRIM(NEW.verified_name))
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  RAISE EXCEPTION
    'Refusing to attach verified name "%" to client % — no supporting evidence (name mismatch, no prior link, no order with this verified name from a linked nickname). This protects against cross-contamination from wrong "merge into existing client" actions.',
    NEW.verified_name, NEW.client_id
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_verified_name_attachment ON public.client_verified_names;
CREATE TRIGGER trg_validate_verified_name_attachment
  BEFORE INSERT OR UPDATE OF verified_name, client_id
  ON public.client_verified_names
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_verified_name_attachment();

-- =========================================================================
-- 4. GUARD: trg_block_nickname_client_reassignment
-- Block changing client_id on an existing client_binance_nicknames row.
-- A nickname belongs to one person — re-pointing it usually means the
-- previous link was wrong; require an explicit delete + re-insert so the
-- operator confirms intent.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.block_nickname_client_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id <> OLD.client_id THEN
    RAISE EXCEPTION
      'Refusing to reassign nickname "%" from client % to client %. Delete the existing link explicitly first if this is intentional.',
      OLD.nickname, OLD.client_id, NEW.client_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_nickname_client_reassignment ON public.client_binance_nicknames;
CREATE TRIGGER trg_block_nickname_client_reassignment
  BEFORE UPDATE OF client_id
  ON public.client_binance_nicknames
  FOR EACH ROW
  EXECUTE FUNCTION public.block_nickname_client_reassignment();