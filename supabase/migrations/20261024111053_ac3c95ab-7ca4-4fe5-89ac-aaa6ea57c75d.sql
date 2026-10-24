-- SP-FIX round 2, patch 1 (24 Oct 2026): non-USDT cost pool hardening. Two parts, one transaction.
-- Part A, public.apply_wallet_movement_to_cost_pool: a purchase edit reverses the purchase's wallet credit
--   and re-posts it. The reversal leaves at the rate the credit was posted with; from now on the re-post of
--   the same coin in the same transaction comes back at that same rate (kept for this transaction only), so
--   a price snapshot recorded after the credit can change neither leg. A product change (re-post in another
--   coin) still takes the newest snapshot for the new coin, which the edit screen records just before saving.
-- Part B, price_snapshots: created_at always comes from the database clock (a value sent by a client is
--   ignored), so no snapshot can be dated before or after the moment it was recorded. New rows only.
-- Forward-only: replaces one function body, adds one small trigger; it reads and writes no existing row.
-- Idempotent (a second run changes nothing). Part A refuses to run on a body other than the deployed SP-FIX
-- round 2 one and checks its own result; on any error nothing at all is applied.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $patch$
DECLARE
  c_before constant text := '7a753819f7ac90e9fbfe732c8732fc6f';  -- deployed body, whitespace-normalised md5
  c_after  constant text := '370362603634b17a9b03773490247955';  -- patched body, whitespace-normalised md5
  a1 constant text := E'  v_short numeric;\nBEGIN\n';
  b1 constant text := E'  v_short numeric;\n  v_rkey text;\n  v_used text;\nBEGIN\n';
  a2 constant text := E'    v_skey := ''app.cost_pool_shortfall_'' || md5(v_order::text || ''|'' || v_asset);\n';
  b2 constant text := a2
    || E'    -- One rate per purchase and coin within an edit: the reversal records the rate it used; the re-post of\n'
    || E'    -- the same coin in the same transaction takes it (''none'': no rate, so the average cost).\n'
    || E'    v_rkey := ''app.cost_pool_rate_'' || md5(v_order::text || ''|'' || v_asset);\n'
    || E'    IF NEW.reverses_transaction_id IS NOT NULL THEN\n'
    || E'      PERFORM set_config(v_rkey, COALESCE(v_rate::text, ''none''), true);\n'
    || E'    ELSE\n'
    || E'      v_used := NULLIF(current_setting(v_rkey, true), '''');\n'
    || E'      IF v_used IS NOT NULL THEN\n'
    || E'        v_rate := NULLIF(v_used, ''none'')::numeric;\n'
    || E'      END IF;\n'
    || E'    END IF;\n';
  v_md5 text;
  v_def text;
BEGIN
  SELECT md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO v_md5
    FROM pg_proc p WHERE p.proname = 'apply_wallet_movement_to_cost_pool' AND p.pronamespace = 'public'::regnamespace;
  IF v_md5 = c_after THEN
    RAISE NOTICE 'apply_wallet_movement_to_cost_pool: patch 1 already applied, nothing to do';
    RETURN;
  END IF;
  IF v_md5 IS DISTINCT FROM c_before THEN
    RAISE EXCEPTION 'apply_wallet_movement_to_cost_pool is not the SP-FIX round 2 definition (%); nothing applied', v_md5;
  END IF;
  v_def := pg_get_functiondef('public.apply_wallet_movement_to_cost_pool()'::regprocedure);
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1
     OR (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'apply_wallet_movement_to_cost_pool: patch anchors not found exactly once; nothing applied';
  END IF;
  EXECUTE replace(replace(v_def, a1, b1), a2, b2);
  SELECT md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO v_md5
    FROM pg_proc p WHERE p.proname = 'apply_wallet_movement_to_cost_pool' AND p.pronamespace = 'public'::regnamespace;
  IF v_md5 IS DISTINCT FROM c_after THEN
    RAISE EXCEPTION 'apply_wallet_movement_to_cost_pool: patched body is not the expected one (%); nothing applied', v_md5;
  END IF;
  RAISE NOTICE 'apply_wallet_movement_to_cost_pool: patch 1 applied';
END
$patch$;

-- Part B
CREATE OR REPLACE FUNCTION public.price_snapshots_stamp_created_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.created_at := now();   -- the database clock, whatever the client sent
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.price_snapshots_stamp_created_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_snapshots_stamp_created_at() TO service_role;

DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'price_snapshots_stamp_created_at' AND tgrelid = 'public.price_snapshots'::regclass) THEN
    CREATE TRIGGER price_snapshots_stamp_created_at BEFORE INSERT ON public.price_snapshots
      FOR EACH ROW EXECUTE FUNCTION public.price_snapshots_stamp_created_at();
  END IF;
END
$t$;

COMMIT;