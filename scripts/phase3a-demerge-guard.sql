-- =====================================================================
-- Phase 3a De-Merge Guard — reconciliation harness (READ-ONLY queries)
-- =====================================================================
-- Wraps the existing SECURITY DEFINER functions:
--   public.phase3a_demerge()          -- executes one batch, logs to
--                                        client_demerge_rollback_log
--   public.phase3a_demerge_rollback() -- reverses a batch by batch_id
--
-- NO new de-merge batch runs until the BEFORE/AFTER reconciliation below
-- is reviewed and signed off. Turnover + order-count must be conserved.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 — PRE-RUN MANIFEST: the exact SPLIT rows a new batch would touch
-- ---------------------------------------------------------------------
-- Mirrors the WHERE clause inside phase3a_demerge().
WITH candidates AS (
  SELECT DISTINCT m.client_uuid, m.resolved_userno, m.anchor_userno
  FROM client_nickname_merge_audit_report m
  WHERE m.proposed_action = 'SPLIT'
    AND m.resolved_userno IS NOT NULL
    AND m.resolved_userno <> m.anchor_userno
    AND NOT (m.nickname ILIKE 'BlynkEx%' OR m.nickname ILIKE 'ASEC%')
)
SELECT c.*,
       (SELECT btrim(verified_name)
          FROM cp_order_identity ci
         WHERE ci.cp_userno = c.resolved_userno
           AND coalesce(btrim(ci.verified_name),'') <> ''
         ORDER BY ci.create_time DESC LIMIT 1) AS resolved_verified_name
FROM candidates c
ORDER BY c.client_uuid;

-- ---------------------------------------------------------------------
-- STEP 2 — BEFORE snapshot: per-userNo order-count + turnover
-- ---------------------------------------------------------------------
-- Run this BEFORE phase3a_demerge(). Persist the output for comparison.
WITH candidates AS (
  SELECT DISTINCT m.resolved_userno
  FROM client_nickname_merge_audit_report m
  WHERE m.proposed_action = 'SPLIT'
    AND m.resolved_userno IS NOT NULL
    AND m.resolved_userno <> m.anchor_userno
    AND NOT (m.nickname ILIKE 'BlynkEx%' OR m.nickname ILIKE 'ASEC%')
),
orders AS (
  SELECT ci.cp_userno, ci.order_number
  FROM cp_order_identity ci
  WHERE ci.cp_userno IN (SELECT resolved_userno FROM candidates)
)
SELECT
  o.cp_userno,
  count(DISTINCT s.order_number)                       AS sales_count,
  COALESCE(sum(DISTINCT_val_s.total_amount), 0)        AS sales_turnover,
  count(DISTINCT p.order_number)                       AS purchase_count,
  COALESCE(sum(DISTINCT_val_p.total_amount), 0)        AS purchase_turnover
FROM orders o
LEFT JOIN sales_orders s      ON s.order_number = o.order_number
LEFT JOIN LATERAL (SELECT s.total_amount) DISTINCT_val_s ON true
LEFT JOIN purchase_orders p   ON p.order_number = o.order_number
LEFT JOIN LATERAL (SELECT p.total_amount) DISTINCT_val_p ON true
GROUP BY o.cp_userno
ORDER BY o.cp_userno;

-- ---------------------------------------------------------------------
-- STEP 3 — EXECUTE (only after sign-off)
-- ---------------------------------------------------------------------
-- SELECT * FROM public.phase3a_demerge();
-- Record the returned out_batch_id.

-- ---------------------------------------------------------------------
-- STEP 4 — AFTER snapshot: re-run STEP 2 verbatim.
-- Invariants that MUST hold per cp_userno (else rollback):
--   sales_count(after)     == sales_count(before)
--   purchase_count(after)  == purchase_count(before)
--   sales_turnover(after)      == sales_turnover(before)    (tol 0.01)
--   purchase_turnover(after)   == purchase_turnover(before) (tol 0.01)
-- The split only re-attributes ownership; it never creates/drops volume.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- STEP 5 — Log-vs-mutation acceptance check for a given batch
-- ---------------------------------------------------------------------
-- Replace :batch with the out_batch_id from STEP 3.
-- Count of mutation log rows must equal what the function reported.
-- SELECT entity_type, count(*)
-- FROM client_demerge_rollback_log
-- WHERE batch_id = :batch
-- GROUP BY entity_type ORDER BY entity_type;

-- ---------------------------------------------------------------------
-- STEP 6 — ROLLBACK (if any invariant fails)
-- ---------------------------------------------------------------------
-- SELECT public.phase3a_demerge_rollback('<out_batch_id>');
