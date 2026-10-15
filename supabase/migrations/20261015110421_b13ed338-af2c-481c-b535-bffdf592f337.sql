-- TO-FIX-1 clean-up — owner-approved 15 Oct 2026 (16:07 IST).
-- Scope: only phone values that are provably another counterparty's, plus the state that came with them.
--   * terminal_sales_sync.contact_number / state
--   * sales_orders.client_phone / client_state (orders linked to a Terminal sync row and to an ERP client)
-- Identity = Binance userNo, the ERP client and the exact unmasked nickname. Names are never used.
-- A phone is FOREIGN for a row when the phone belongs (per counterparty_contact_records or clients.phone)
-- only to identities that are not the row's own. It is PROVABLE when the old 3-letter prefix propagation
-- explains it (the owning record's nickname starts with the row's masked-nickname prefix), or when the
-- phone sits on sync rows of 3+ different userNos (or on sales orders of 3+ different clients).
-- Replacement: the row's own contact record (exact, unambiguous nickname) → its ERP client's phone →
-- a record under another nickname of the same userNo → NULL. State: own state when known; otherwise
-- NULL on sync rows and unchanged on sales orders. Empty states are never filled.
-- Left alone: own/unknown phones, uncertain foreign phones, and sales orders without client_id (their
-- BEFORE trigger would link a client by name).
-- Every change is written to two backup tables first; docs/cleanup/to_fix_1_rollback.sql undoes it.
-- The block aborts (nothing changes) if any other table or column would be affected.
DO $cleanup$
DECLARE
  v_test boolean := false;
  v_sync_planned int; v_sync_applied int; v_sales_planned int; v_sales_applied int;
  b_side text; a_side text; b_sync_rest text; a_sync_rest text; b_sales_rest text; a_sales_rest text;
  v_left_foreign_sync int; v_left_foreign_sales int; v_summary jsonb;
BEGIN
  -- 1. Identity building blocks
  CREATE TEMP TABLE c_nick_uno ON COMMIT DROP AS
    SELECT DISTINCT nickname AS nick, trim(cp_userno) AS uno FROM public.cp_order_identity
    WHERE nullif(trim(nickname),'') IS NOT NULL AND nickname NOT LIKE '%*%' AND nullif(trim(cp_userno),'') IS NOT NULL;
  CREATE INDEX ON c_nick_uno(nick); CREATE INDEX ON c_nick_uno(uno);
  CREATE TEMP TABLE c_uno_client ON COMMIT DROP AS
    SELECT DISTINCT trim(cp_userno) AS uno, client_id FROM public.client_binance_usernos WHERE is_active;
  CREATE INDEX ON c_uno_client(uno); CREATE INDEX ON c_uno_client(client_id);
  CREATE TEMP TABLE c_blocked ON COMMIT DROP AS
    SELECT DISTINCT right(regexp_replace(phone,'\D','','g'),10) AS ph FROM public.blocked_phone_numbers;
  CREATE TEMP TABLE c_rec ON COMMIT DROP AS
    SELECT counterparty_nickname AS nick,
      CASE WHEN length(regexp_replace(coalesce(contact_number,''),'\D','','g')) >= 10
           THEN right(regexp_replace(contact_number,'\D','','g'),10) END AS ph,
      nullif(btrim(contact_number),'') AS raw_ph, nullif(btrim(state),'') AS st
    FROM public.counterparty_contact_records WHERE counterparty_nickname NOT LIKE '%*%';
  CREATE INDEX ON c_rec(nick); CREATE INDEX ON c_rec(ph);
  -- phone -> owner identity keys (U:userNo, C:client, N:nickname)
  CREATE TEMP TABLE c_owner ON COMMIT DROP AS
    SELECT ph, 'N:'||nick AS k FROM c_rec WHERE ph IS NOT NULL
    UNION SELECT r.ph, 'U:'||n.uno FROM c_rec r JOIN c_nick_uno n ON n.nick = r.nick WHERE r.ph IS NOT NULL
    UNION SELECT r.ph, 'C:'||uc.client_id FROM c_rec r JOIN c_nick_uno n ON n.nick = r.nick JOIN c_uno_client uc ON uc.uno = n.uno WHERE r.ph IS NOT NULL
    UNION SELECT right(regexp_replace(c.phone,'\D','','g'),10), 'C:'||c.id FROM public.clients c
      WHERE NOT coalesce(c.is_deleted,false) AND length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10
    UNION SELECT right(regexp_replace(c.phone,'\D','','g'),10), 'U:'||uc.uno FROM public.clients c JOIN c_uno_client uc ON uc.client_id = c.id
      WHERE NOT coalesce(c.is_deleted,false) AND length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10;
  CREATE INDEX ON c_owner(ph, k);

  -- 2. Sync rows with identity
  CREATE TEMP TABLE c_row ON COMMIT DROP AS
    SELECT t.id, t.client_id, t.contact_number AS raw_phone, t.state AS raw_state,
      CASE WHEN length(regexp_replace(coalesce(t.contact_number,''),'\D','','g')) >= 10
           THEN right(regexp_replace(t.contact_number,'\D','','g'),10) END AS ph,
      nullif(btrim(t.state),'') AS st,
      lower(left(coalesce(t.order_data->>'counterparty_nickname',''),3)) AS mprefix,
      coalesce(nullif(trim(t.order_data->>'cp_userno'),''), nullif(trim(ci.cp_userno),'')) AS uno,
      coalesce(nullif(t.order_data->>'counterparty_nickname_unmasked',''), nullif(ci.nickname,'')) AS nick
    FROM public.terminal_sales_sync t LEFT JOIN public.cp_order_identity ci ON ci.order_number = t.binance_order_number;
  CREATE INDEX ON c_row(id); CREATE INDEX ON c_row(ph);
  CREATE TEMP TABLE c_rowkey ON COMMIT DROP AS
    SELECT id, 'U:'||uno AS k FROM c_row WHERE uno IS NOT NULL
    UNION SELECT id, 'N:'||nick FROM c_row WHERE nick IS NOT NULL AND nick NOT LIKE '%*%'
    UNION SELECT id, 'C:'||client_id FROM c_row WHERE client_id IS NOT NULL
    UNION SELECT r.id, 'C:'||uc.client_id FROM c_row r JOIN c_uno_client uc ON uc.uno = r.uno
    UNION SELECT r.id, 'U:'||uc2.uno FROM c_row r JOIN c_uno_client uc ON uc.uno = r.uno JOIN c_uno_client uc2 ON uc2.client_id = uc.client_id
    UNION SELECT r.id, 'U:'||uc.uno FROM c_row r JOIN c_uno_client uc ON uc.client_id = r.client_id;
  CREATE INDEX ON c_rowkey(id, k);
  CREATE TEMP TABLE c_spread ON COMMIT DROP AS
    SELECT ph, count(DISTINCT uno) AS unos FROM c_row WHERE ph IS NOT NULL GROUP BY ph;
  CREATE INDEX ON c_spread(ph);
  CREATE TEMP TABLE c_so_spread ON COMMIT DROP AS
    SELECT right(regexp_replace(client_phone,'\D','','g'),10) AS ph, count(DISTINCT client_id) AS clients FROM public.sales_orders
    WHERE length(regexp_replace(coalesce(client_phone,''),'\D','','g')) >= 10 GROUP BY 1;
  CREATE INDEX ON c_so_spread(ph);
  ANALYZE c_nick_uno; ANALYZE c_uno_client; ANALYZE c_rec; ANALYZE c_owner; ANALYZE c_row; ANALYZE c_rowkey; ANALYZE c_spread; ANALYZE c_so_spread;

  -- 3. Sync rows: provably foreign phones and their replacements
  CREATE TEMP TABLE c_sync_fix ON COMMIT DROP AS
  WITH f AS (
    SELECT r.*,
      coalesce(r.client_id, (SELECT min(uc.client_id::text)::uuid FROM c_uno_client uc WHERE uc.uno = r.uno
                             HAVING count(DISTINCT uc.client_id) = 1)) AS cid,
      EXISTS (SELECT 1 FROM c_rec x WHERE x.ph = r.ph AND x.nick <> coalesce(r.nick,'') AND r.mprefix <> ''
              AND lower(left(x.nick,3)) = r.mprefix) AS prefix_explained,
      (SELECT s.unos FROM c_spread s WHERE s.ph = r.ph) AS spread
    FROM c_row r
    WHERE r.ph IS NOT NULL
      AND EXISTS (SELECT 1 FROM c_owner o WHERE o.ph = r.ph)
      AND NOT EXISTS (SELECT 1 FROM c_owner o JOIN c_rowkey rk ON rk.id = r.id AND rk.k = o.k WHERE o.ph = r.ph)
  ), p AS (
    SELECT f.*,
      -- own record: exact nickname whose userNos are only this row's
      (SELECT x.raw_ph FROM c_rec x WHERE x.nick = f.nick AND x.ph IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM c_nick_uno n WHERE n.nick = f.nick AND n.uno IS DISTINCT FROM f.uno)
         AND NOT EXISTS (SELECT 1 FROM c_blocked b WHERE b.ph = x.ph) LIMIT 1) AS own_rec_phone,
      (SELECT x.st FROM c_rec x WHERE x.nick = f.nick
         AND NOT EXISTS (SELECT 1 FROM c_nick_uno n WHERE n.nick = f.nick AND n.uno IS DISTINCT FROM f.uno) LIMIT 1) AS own_rec_state,
      (SELECT CASE WHEN length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10
                    AND NOT EXISTS (SELECT 1 FROM c_blocked b WHERE b.ph = right(regexp_replace(c.phone,'\D','','g'),10))
                   THEN nullif(btrim(c.phone),'') END
         FROM public.clients c WHERE c.id = f.cid AND NOT coalesce(c.is_deleted,false)) AS master_phone,
      (SELECT nullif(btrim(c.state),'') FROM public.clients c WHERE c.id = f.cid AND NOT coalesce(c.is_deleted,false)) AS master_state,
      (SELECT x.raw_ph FROM c_rec x JOIN c_nick_uno n ON n.nick = x.nick
         WHERE n.uno = f.uno AND x.nick <> coalesce(f.nick,'') AND x.ph IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM c_nick_uno n2 WHERE n2.nick = x.nick AND n2.uno <> f.uno)
           AND NOT EXISTS (SELECT 1 FROM c_blocked b WHERE b.ph = x.ph)
         ORDER BY x.nick LIMIT 1) AS uno_rec_phone
    FROM f
    WHERE f.prefix_explained OR coalesce(f.spread,0) >= 3
  )
  SELECT id,
    raw_phone AS old_phone, raw_state AS old_state,
    coalesce(own_rec_phone, master_phone, uno_rec_phone) AS new_phone,
    CASE WHEN st IS NULL THEN raw_state
         WHEN coalesce(own_rec_state, master_state) IS NULL THEN NULL
         WHEN lower(coalesce(own_rec_state, master_state)) = lower(st) THEN raw_state
         ELSE coalesce(own_rec_state, master_state) END AS new_state,
    CASE WHEN own_rec_phone IS NOT NULL THEN 'own_record'
         WHEN master_phone IS NOT NULL THEN 'client_master'
         WHEN uno_rec_phone IS NOT NULL THEN 'record_same_userno'
         ELSE 'cleared' END AS phone_source,
    CASE WHEN prefix_explained THEN 'prefix' ELSE 'spread' END AS evidence
  FROM p;
  SELECT count(*) INTO v_sync_planned FROM c_sync_fix;

  -- 4. Sales orders linked to a sync row and to an ERP client
  CREATE TEMP TABLE c_so ON COMMIT DROP AS
    SELECT DISTINCT ON (s.id) s.id, s.client_id, s.client_phone AS raw_phone, s.client_state AS raw_state,
      CASE WHEN length(regexp_replace(coalesce(s.client_phone,''),'\D','','g')) >= 10
           THEN right(regexp_replace(s.client_phone,'\D','','g'),10) END AS ph,
      nullif(btrim(s.client_state),'') AS st,
      lower(left(coalesce(t.order_data->>'counterparty_nickname',''),3)) AS mprefix,
      coalesce(nullif(trim(t.order_data->>'cp_userno'),''), nullif(trim(ci.cp_userno),'')) AS uno,
      coalesce(nullif(t.order_data->>'counterparty_nickname_unmasked',''), nullif(ci.nickname,'')) AS nick
    FROM public.sales_orders s
    JOIN public.terminal_sales_sync t ON t.sales_order_id = s.id OR s.terminal_sync_id = t.id
    LEFT JOIN public.cp_order_identity ci ON ci.order_number = t.binance_order_number
    WHERE s.client_id IS NOT NULL
    ORDER BY s.id, (t.sales_order_id = s.id) DESC;
  CREATE INDEX ON c_so(id); CREATE INDEX ON c_so(ph);
  CREATE TEMP TABLE c_sokey ON COMMIT DROP AS
    SELECT id, 'U:'||uno AS k FROM c_so WHERE uno IS NOT NULL
    UNION SELECT id, 'N:'||nick FROM c_so WHERE nick IS NOT NULL AND nick NOT LIKE '%*%'
    UNION SELECT id, 'C:'||client_id FROM c_so
    UNION SELECT s.id, 'U:'||uc.uno FROM c_so s JOIN c_uno_client uc ON uc.client_id = s.client_id
    UNION SELECT s.id, 'C:'||uc.client_id FROM c_so s JOIN c_uno_client uc ON uc.uno = s.uno;
  CREATE INDEX ON c_sokey(id, k);
  ANALYZE c_so; ANALYZE c_sokey;
  CREATE TEMP TABLE c_sales_fix ON COMMIT DROP AS
  WITH f AS (
    SELECT s.*,
      EXISTS (SELECT 1 FROM c_rec x WHERE x.ph = s.ph AND x.nick <> coalesce(s.nick,'') AND s.mprefix <> ''
              AND lower(left(x.nick,3)) = s.mprefix) AS prefix_explained,
      (SELECT sp.unos FROM c_spread sp WHERE sp.ph = s.ph) AS spread,
      (SELECT cs.clients FROM c_so_spread cs WHERE cs.ph = s.ph) AS so_clients
    FROM c_so s
    WHERE s.ph IS NOT NULL
      AND EXISTS (SELECT 1 FROM c_owner o WHERE o.ph = s.ph)
      AND NOT EXISTS (SELECT 1 FROM c_owner o JOIN c_sokey sk ON sk.id = s.id AND sk.k = o.k WHERE o.ph = s.ph)
  ), p AS (
    SELECT f.*,
      (SELECT x.raw_ph FROM c_rec x WHERE x.nick = f.nick AND x.ph IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM c_nick_uno n WHERE n.nick = f.nick AND n.uno IS DISTINCT FROM f.uno)
         AND NOT EXISTS (SELECT 1 FROM c_blocked b WHERE b.ph = x.ph) LIMIT 1) AS own_rec_phone,
      (SELECT x.st FROM c_rec x WHERE x.nick = f.nick
         AND NOT EXISTS (SELECT 1 FROM c_nick_uno n WHERE n.nick = f.nick AND n.uno IS DISTINCT FROM f.uno) LIMIT 1) AS own_rec_state,
      (SELECT CASE WHEN length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10
                    AND NOT EXISTS (SELECT 1 FROM c_blocked b WHERE b.ph = right(regexp_replace(c.phone,'\D','','g'),10))
                   THEN nullif(btrim(c.phone),'') END
         FROM public.clients c WHERE c.id = f.client_id AND NOT coalesce(c.is_deleted,false)) AS master_phone,
      (SELECT nullif(btrim(c.state),'') FROM public.clients c WHERE c.id = f.client_id AND NOT coalesce(c.is_deleted,false)) AS master_state
    FROM f
    WHERE f.prefix_explained OR coalesce(f.spread,0) >= 3 OR coalesce(f.so_clients,0) >= 3
  )
  SELECT id,
    raw_phone AS old_phone, raw_state AS old_state,
    coalesce(own_rec_phone, master_phone) AS new_phone,
    CASE WHEN st IS NULL THEN raw_state
         WHEN coalesce(own_rec_state, master_state) IS NOT NULL AND lower(coalesce(own_rec_state, master_state)) <> lower(st)
           THEN coalesce(own_rec_state, master_state)
         ELSE raw_state END AS new_state,
    CASE WHEN own_rec_phone IS NOT NULL THEN 'own_record' WHEN master_phone IS NOT NULL THEN 'client_master' ELSE 'cleared' END AS phone_source,
    CASE WHEN prefix_explained THEN 'prefix' ELSE 'spread' END AS evidence
  FROM p;
  SELECT count(*) INTO v_sales_planned FROM c_sales_fix;

  -- 5. Fingerprints that must not change: the target rows' other columns, and every row in the tables the
  --    sales_orders triggers can write, limited to the target orders and their clients.
  CREATE TEMP TABLE c_side_keys ON COMMIT DROP AS
    SELECT s.id AS so_id, s.order_number, s.client_id FROM public.sales_orders s WHERE s.id IN (SELECT id FROM c_sales_fix);
  CREATE OR REPLACE FUNCTION pg_temp.to_fix_1_side() RETURNS text LANGUAGE sql AS $f$
    SELECT md5(concat_ws('|',
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.stock_transactions x WHERE x.reference_number IN (SELECT order_number FROM c_side_keys)),
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.pending_settlements x WHERE x.sales_order_id IN (SELECT so_id FROM c_side_keys)),
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.client_onboarding_approvals x WHERE x.sales_order_id IN (SELECT so_id FROM c_side_keys)),
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.bank_transactions x WHERE x.reference_number IN (SELECT order_number FROM c_side_keys)),
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.wallet_transactions x WHERE x.reference_id::text IN (SELECT so_id::text FROM c_side_keys)),
      (SELECT coalesce(string_agg(md5(x::text), '' ORDER BY x.id), '') FROM public.clients x WHERE x.id IN (SELECT client_id FROM c_side_keys))));
  $f$;
  b_side := pg_temp.to_fix_1_side();
  SELECT md5(coalesce(string_agg(md5((to_jsonb(t) - 'contact_number' - 'state')::text), '' ORDER BY t.id), ''))
    INTO b_sync_rest FROM public.terminal_sales_sync t WHERE t.id IN (SELECT id FROM c_sync_fix);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(s) - 'client_phone' - 'client_state')::text), '' ORDER BY s.id), ''))
    INTO b_sales_rest FROM public.sales_orders s WHERE s.id IN (SELECT id FROM c_sales_fix);

  -- 6. Backups (kept; service role only)
  CREATE TABLE public.to_fix_1_cleanup_sync_backup (
    id uuid PRIMARY KEY, old_contact_number text, old_state text, new_contact_number text, new_state text,
    phone_source text NOT NULL, evidence text NOT NULL, applied boolean NOT NULL DEFAULT false, cleaned_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.to_fix_1_cleanup_sales_backup (
    id uuid PRIMARY KEY, old_client_phone text, old_client_state text, new_client_phone text, new_client_state text,
    phone_source text NOT NULL, evidence text NOT NULL, applied boolean NOT NULL DEFAULT false, cleaned_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.to_fix_1_cleanup_sync_backup ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.to_fix_1_cleanup_sales_backup ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.to_fix_1_cleanup_sync_backup FROM anon, authenticated;
  REVOKE ALL ON public.to_fix_1_cleanup_sales_backup FROM anon, authenticated;
  INSERT INTO public.to_fix_1_cleanup_sync_backup (id, old_contact_number, old_state, new_contact_number, new_state, phone_source, evidence)
    SELECT id, old_phone, old_state, new_phone, new_state, phone_source, evidence FROM c_sync_fix;
  INSERT INTO public.to_fix_1_cleanup_sales_backup (id, old_client_phone, old_client_state, new_client_phone, new_client_state, phone_source, evidence)
    SELECT id, old_phone, old_state, new_phone, new_state, phone_source, evidence FROM c_sales_fix;

  -- 7. Apply — only where the row still holds exactly the backed-up values
  WITH upd AS (
    UPDATE public.terminal_sales_sync t SET contact_number = b.new_contact_number, state = b.new_state
    FROM public.to_fix_1_cleanup_sync_backup b
    WHERE t.id = b.id AND t.contact_number IS NOT DISTINCT FROM b.old_contact_number AND t.state IS NOT DISTINCT FROM b.old_state
    RETURNING t.id)
  UPDATE public.to_fix_1_cleanup_sync_backup b SET applied = true FROM upd WHERE b.id = upd.id;
  GET DIAGNOSTICS v_sync_applied = ROW_COUNT;
  WITH upd AS (
    UPDATE public.sales_orders s SET client_phone = b.new_client_phone, client_state = b.new_client_state
    FROM public.to_fix_1_cleanup_sales_backup b
    WHERE s.id = b.id AND s.client_id IS NOT NULL
      AND s.client_phone IS NOT DISTINCT FROM b.old_client_phone AND s.client_state IS NOT DISTINCT FROM b.old_client_state
    RETURNING s.id)
  UPDATE public.to_fix_1_cleanup_sales_backup b SET applied = true FROM upd WHERE b.id = upd.id;
  GET DIAGNOSTICS v_sales_applied = ROW_COUNT;

  -- 8. Nothing else may have changed
  a_side := pg_temp.to_fix_1_side();
  SELECT md5(coalesce(string_agg(md5((to_jsonb(t) - 'contact_number' - 'state')::text), '' ORDER BY t.id), ''))
    INTO a_sync_rest FROM public.terminal_sales_sync t WHERE t.id IN (SELECT id FROM c_sync_fix);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(s) - 'client_phone' - 'client_state')::text), '' ORDER BY s.id), ''))
    INTO a_sales_rest FROM public.sales_orders s WHERE s.id IN (SELECT id FROM c_sales_fix);
  IF a_side <> b_side OR a_sync_rest <> b_sync_rest OR a_sales_rest <> b_sales_rest THEN
    RAISE EXCEPTION 'TO-FIX-1 clean-up aborted, nothing changed: side effect detected (linked ledgers/clients same: %, sync other columns same: %, sales other columns same: %)',
      (a_side = b_side), (a_sync_rest = b_sync_rest), (a_sales_rest = b_sales_rest);
  END IF;

  -- 9. Re-check: no provably foreign phone left on the rows we planned to fix
  SELECT count(*) INTO v_left_foreign_sync FROM public.terminal_sales_sync t JOIN c_sync_fix f ON f.id = t.id
    WHERE right(regexp_replace(coalesce(t.contact_number,''),'\D','','g'),10) IS DISTINCT FROM right(regexp_replace(coalesce(f.new_phone,''),'\D','','g'),10);
  SELECT count(*) INTO v_left_foreign_sales FROM public.sales_orders s JOIN c_sales_fix f ON f.id = s.id
    WHERE right(regexp_replace(coalesce(s.client_phone,''),'\D','','g'),10) IS DISTINCT FROM right(regexp_replace(coalesce(f.new_phone,''),'\D','','g'),10);

  v_summary := jsonb_build_object(
    'sync_planned', v_sync_planned, 'sync_applied', v_sync_applied,
    'sync_phone', (SELECT jsonb_object_agg(phone_source, n) FROM (SELECT phone_source, count(*) n FROM c_sync_fix GROUP BY 1) x),
    'sync_state', (SELECT jsonb_object_agg(k, n) FROM (SELECT CASE WHEN new_state IS NOT DISTINCT FROM old_state THEN 'unchanged'
                      WHEN new_state IS NULL THEN 'cleared' ELSE 'set_own' END k, count(*) n FROM c_sync_fix GROUP BY 1) x),
    'sync_evidence', (SELECT jsonb_object_agg(evidence, n) FROM (SELECT evidence, count(*) n FROM c_sync_fix GROUP BY 1) x),
    'sales_planned', v_sales_planned, 'sales_applied', v_sales_applied,
    'sales_phone', (SELECT jsonb_object_agg(phone_source, n) FROM (SELECT phone_source, count(*) n FROM c_sales_fix GROUP BY 1) x),
    'sales_state', (SELECT jsonb_object_agg(k, n) FROM (SELECT CASE WHEN new_state IS NOT DISTINCT FROM old_state THEN 'unchanged'
                      WHEN new_state IS NULL THEN 'cleared' ELSE 'set_own' END k, count(*) n FROM c_sales_fix GROUP BY 1) x),
    'left_mismatch_sync', v_left_foreign_sync, 'left_mismatch_sales', v_left_foreign_sales,
    'side_effects', 'none');
  IF v_test THEN
    RAISE EXCEPTION 'TEST-ROLLBACK %', v_summary::text;
  END IF;
  RAISE NOTICE 'TO-FIX-1 clean-up done: %', v_summary::text;
END $cleanup$;