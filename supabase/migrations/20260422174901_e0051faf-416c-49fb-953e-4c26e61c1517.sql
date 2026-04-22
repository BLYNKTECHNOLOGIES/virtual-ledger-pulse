
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. Add hash-chain columns to wallet_transactions
-- ============================================================
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS sequence_no            bigint,
  ADD COLUMN IF NOT EXISTS prev_hash              text,
  ADD COLUMN IF NOT EXISTS row_hash               text,
  ADD COLUMN IF NOT EXISTS reverses_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS is_reversed            boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_reverses_fk'
  ) THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_reverses_fk
      FOREIGN KEY (reverses_transaction_id)
      REFERENCES public.wallet_transactions(id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_reverses_once
  ON public.wallet_transactions(reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_wallet_seq
  ON public.wallet_transactions(wallet_id, sequence_no)
  WHERE sequence_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_seq_desc
  ON public.wallet_transactions(wallet_id, sequence_no DESC)
  WHERE sequence_no IS NOT NULL;

-- ============================================================
-- 2. Canonical payload + hash helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.wallet_tx_canonical_payload(
  p_id uuid,
  p_wallet_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_description text,
  p_balance_before numeric,
  p_balance_after numeric,
  p_created_at timestamptz,
  p_created_by uuid,
  p_asset_code text,
  p_related_transaction_id uuid,
  p_market_rate_usdt numeric,
  p_effective_usdt_qty numeric,
  p_effective_usdt_rate numeric,
  p_price_snapshot_id uuid,
  p_sequence_no bigint,
  p_reverses_transaction_id uuid
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT concat_ws('|',
    p_id::text,
    p_wallet_id::text,
    p_transaction_type,
    p_amount::text,
    COALESCE(p_reference_type, ''),
    COALESCE(p_reference_id::text, ''),
    COALESCE(p_description, ''),
    p_balance_before::text,
    p_balance_after::text,
    to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    COALESCE(p_created_by::text, ''),
    p_asset_code,
    COALESCE(p_related_transaction_id::text, ''),
    COALESCE(p_market_rate_usdt::text, ''),
    COALESCE(p_effective_usdt_qty::text, ''),
    COALESCE(p_effective_usdt_rate::text, ''),
    COALESCE(p_price_snapshot_id::text, ''),
    p_sequence_no::text,
    COALESCE(p_reverses_transaction_id::text, '')
  );
$$;

CREATE OR REPLACE FUNCTION public.wallet_tx_compute_hash(
  p_payload text,
  p_prev_hash text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(p_payload || '|' || COALESCE(p_prev_hash, ''), 'sha256'),
    'hex'
  );
$$;

-- ============================================================
-- 3. Backfill chronologically per wallet
-- ============================================================
DO $backfill$
DECLARE
  r record;
  v_prev_hash text;
  v_current_wallet uuid := NULL;
  v_seq bigint;
  v_payload text;
  v_hash text;
BEGIN
  FOR r IN
    SELECT *
    FROM public.wallet_transactions
    ORDER BY wallet_id, created_at, id
  LOOP
    IF v_current_wallet IS DISTINCT FROM r.wallet_id THEN
      v_current_wallet := r.wallet_id;
      v_prev_hash := NULL;
      v_seq := 0;
    END IF;
    v_seq := v_seq + 1;

    v_payload := public.wallet_tx_canonical_payload(
      r.id, r.wallet_id, r.transaction_type, r.amount,
      r.reference_type, r.reference_id, r.description,
      r.balance_before, r.balance_after, r.created_at, r.created_by,
      r.asset_code, r.related_transaction_id,
      r.market_rate_usdt, r.effective_usdt_qty, r.effective_usdt_rate,
      r.price_snapshot_id, v_seq, NULL
    );
    v_hash := public.wallet_tx_compute_hash(v_payload, v_prev_hash);

    UPDATE public.wallet_transactions
       SET sequence_no = v_seq,
           prev_hash   = v_prev_hash,
           row_hash    = v_hash
     WHERE id = r.id;

    v_prev_hash := v_hash;
  END LOOP;
END
$backfill$;

-- ============================================================
-- 4. ledger_anchors
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ledger_anchors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchored_at       timestamptz NOT NULL DEFAULT now(),
  wallet_id         uuid,
  head_sequence_no  bigint NOT NULL,
  head_row_hash     text   NOT NULL,
  tx_count          bigint NOT NULL,
  anchored_by       uuid
);
CREATE INDEX IF NOT EXISTS idx_ledger_anchors_wallet_time
  ON public.ledger_anchors(wallet_id, anchored_at DESC);

ALTER TABLE public.ledger_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_anchors_select ON public.ledger_anchors;
CREATE POLICY ledger_anchors_select ON public.ledger_anchors
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. ledger_tamper_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ledger_tamper_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at    timestamptz NOT NULL DEFAULT now(),
  attempted_by    uuid,
  attempted_role  text,
  operation       text NOT NULL,
  target_tx_id    uuid,
  old_payload     jsonb,
  new_payload     jsonb,
  reason          text,
  blocked         boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ledger_tamper_log_time
  ON public.ledger_tamper_log(attempted_at DESC);

ALTER TABLE public.ledger_tamper_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_tamper_log_select ON public.ledger_tamper_log;
CREATE POLICY ledger_tamper_log_select ON public.ledger_tamper_log
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 6. Sanity check
-- ============================================================
DO $verify$
DECLARE
  v_break record;
BEGIN
  WITH walked AS (
    SELECT
      id, wallet_id, sequence_no, prev_hash, row_hash,
      LAG(row_hash) OVER (PARTITION BY wallet_id ORDER BY sequence_no) AS expected_prev
    FROM public.wallet_transactions
  )
  SELECT * INTO v_break
  FROM walked
  WHERE sequence_no > 1
    AND prev_hash IS DISTINCT FROM expected_prev
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Backfill chain integrity check FAILED at tx % (wallet %, seq %)',
      v_break.id, v_break.wallet_id, v_break.sequence_no;
  END IF;
END
$verify$;
