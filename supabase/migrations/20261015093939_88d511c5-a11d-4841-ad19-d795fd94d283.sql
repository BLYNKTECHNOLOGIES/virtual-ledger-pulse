CREATE OR REPLACE FUNCTION public.get_terminal_order_client(p_order_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uno text; v_cid uuid; c public.clients%ROWTYPE;
  v_month_start date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_next_start date := (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) + interval '1 month')::date;
  v_ms_ms bigint; v_ns_ms bigint; v_day_ms bigint; v_nday_ms bigint; v_90_ms bigint;
  v_phone text; v_pan text; r jsonb;
  v_buy_total numeric; v_buy_count bigint; v_pend_total numeric; v_pend_count bigint; v_counted boolean;
  v_vname text; v_side text; v_tok_v text[]; v_tok_c text[]; v_name_check text;
  v_ctx jsonb; v_income jsonb; v_pan_shared jsonb; v_ra text; v_remarks jsonb; v_accounts bigint;
  v_msell_total numeric; v_msell_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT (
       public.has_terminal_permission(auth.uid(), 'terminal_orders_view'::public.terminal_permission)
    OR public.has_terminal_permission(auth.uid(), 'terminal_appeals_view'::public.terminal_permission)
    OR public.can_access_client_kyc(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permission to view client details' USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(trim(i.cp_userno),'') INTO v_uno FROM public.cp_order_identity i
   WHERE i.order_number = p_order_number AND i.cp_userno IS NOT NULL LIMIT 1;
  IF v_uno IS NULL THEN
    SELECT NULLIF(trim(CASE WHEN h.order_detail_raw->>'merchantNo' IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.cp_self_merchant_nos s WHERE s.merchant_no = h.order_detail_raw->>'merchantNo')
           THEN h.order_detail_raw->>'merchantNo' ELSE h.order_detail_raw->>'takerUserNo' END),'')
      INTO v_uno FROM public.binance_order_history h WHERE h.order_number = p_order_number LIMIT 1;
  END IF;
  IF v_uno IS NULL THEN RETURN jsonb_build_object('status','identity_pending'); END IF;

  SELECT cl.* INTO c FROM public.client_binance_usernos u JOIN public.clients cl ON cl.id = u.client_id
   WHERE u.cp_userno = v_uno AND u.is_active AND COALESCE(cl.is_deleted,false) = false LIMIT 1;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status','not_client'); END IF;
  v_cid := c.id;

  v_phone := regexp_replace(COALESCE(c.phone,''), '\D', '', 'g');
  v_pan := upper(trim(COALESCE(c.pan_card_number,'')));

  v_ms_ms := (extract(epoch FROM (v_month_start::timestamp AT TIME ZONE 'Asia/Kolkata')) * 1000)::bigint;
  v_ns_ms := (extract(epoch FROM (v_next_start::timestamp AT TIME ZONE 'Asia/Kolkata')) * 1000)::bigint;
  v_day_ms := (extract(epoch FROM ((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')) * 1000)::bigint;
  v_nday_ms := v_day_ms + 86400000;
  v_90_ms := (extract(epoch FROM (now() - interval '90 days')) * 1000)::bigint;

  SELECT COALESCE(sum(s.total_amount),0), count(*),
         COALESCE(bool_or(s.order_number = p_order_number
            OR EXISTS (SELECT 1 FROM public.terminal_sales_sync t WHERE t.binance_order_number = p_order_number AND t.sales_order_id = s.id)
            OR EXISTS (SELECT 1 FROM public.small_sales_order_map m JOIN public.small_sales_sync ss ON ss.id = m.small_sales_sync_id
                        WHERE m.binance_order_number = p_order_number AND ss.sales_order_id = s.id)), false)
    INTO v_buy_total, v_buy_count, v_counted
    FROM public.sales_orders s
   WHERE s.client_id = v_cid AND s.status = 'COMPLETED'
     AND s.order_date >= v_month_start AND s.order_date < v_next_start;

  WITH pend AS (
    SELECT DISTINCT h.order_number, NULLIF(h.total_price,'')::numeric AS amt
      FROM public.client_binance_usernos u
      JOIN public.cp_order_identity i ON i.cp_userno = u.cp_userno
      JOIN public.binance_order_history h ON h.order_number = i.order_number
     WHERE u.client_id = v_cid AND u.is_active
       AND upper(h.trade_type) = 'SELL' AND h.order_status = 'COMPLETED'
       AND h.create_time >= v_ms_ms AND h.create_time < v_ns_ms
       AND NOT EXISTS (SELECT 1 FROM public.terminal_sales_sync t WHERE t.binance_order_number = h.order_number
                        AND (t.sales_order_id IS NOT NULL OR t.sync_status = 'rejected'))
       AND NOT EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.order_number = h.order_number)
       AND NOT EXISTS (SELECT 1 FROM public.small_sales_order_map m JOIN public.small_sales_sync ss ON ss.id = m.small_sales_sync_id
                        WHERE m.binance_order_number = h.order_number AND (ss.sales_order_id IS NOT NULL OR ss.sync_status = 'rejected'))
  )
  SELECT COALESCE(sum(amt),0), count(*), v_counted OR COALESCE(bool_or(order_number = p_order_number), false)
    INTO v_pend_total, v_pend_count, v_counted FROM pend;

  -- TO-CL-4: order context (identity = this client's active userNos only)
  SELECT NULLIF(trim(i.verified_name),'') INTO v_vname FROM public.cp_order_identity i
   WHERE i.order_number = p_order_number AND NULLIF(trim(i.verified_name),'') IS NOT NULL LIMIT 1;
  SELECT upper(h.trade_type) INTO v_side FROM public.binance_order_history h WHERE h.order_number = p_order_number LIMIT 1;

  IF v_vname IS NULL THEN v_name_check := 'unknown';
  ELSE
    SELECT COALESCE(array_agg(DISTINCT t), '{}') INTO v_tok_v
      FROM regexp_split_to_table(regexp_replace(upper(v_vname), '[^A-Z]+', ' ', 'g'), ' ') t WHERE length(t) >= 2;
    SELECT COALESCE(array_agg(DISTINCT t), '{}') INTO v_tok_c
      FROM regexp_split_to_table(regexp_replace(upper(COALESCE(c.name,'')), '[^A-Z]+', ' ', 'g'), ' ') t WHERE length(t) >= 2;
    v_name_check := CASE
      WHEN cardinality(v_tok_v) = 0 OR cardinality(v_tok_c) = 0 THEN 'unknown'
      WHEN v_tok_v @> v_tok_c AND v_tok_c @> v_tok_v THEN 'match'
      WHEN v_tok_v && v_tok_c THEN 'partial'
      ELSE 'mismatch' END;
  END IF;

  WITH o AS (
    SELECT DISTINCT h.order_number, upper(h.trade_type) AS side, h.order_status AS st,
           NULLIF(h.total_price,'')::numeric AS amt, h.create_time AS ct
      FROM public.client_binance_usernos u
      JOIN public.cp_order_identity i ON i.cp_userno = u.cp_userno
      JOIN public.binance_order_history h ON h.order_number = i.order_number
     WHERE u.client_id = v_cid AND u.is_active
  ), ap AS (
    SELECT a.* FROM public.terminal_appeal_cases a WHERE a.order_number IN (SELECT order_number FROM o)
  )
  SELECT jsonb_build_object(
    'name_check', v_name_check,
    'binance_name', v_vname,
    'side_completed', (SELECT count(*) FROM o WHERE side = v_side AND st = 'COMPLETED' AND order_number <> p_order_number),
    'side_median', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amt) FROM o
                     WHERE side = v_side AND st = 'COMPLETED' AND order_number <> p_order_number AND amt IS NOT NULL),
    'today_other_count', (SELECT count(*) FROM o WHERE side = v_side AND st NOT LIKE 'CANCEL%'
                     AND order_number <> p_order_number AND ct >= v_day_ms AND ct < v_nday_ms),
    'today_other_total', (SELECT COALESCE(sum(amt),0) FROM o WHERE side = v_side AND st NOT LIKE 'CANCEL%'
                     AND order_number <> p_order_number AND ct >= v_day_ms AND ct < v_nday_ms),
    'orders_90d', (SELECT count(*) FROM o WHERE ct >= v_90_ms),
    'cancelled_90d', (SELECT count(*) FROM o WHERE ct >= v_90_ms AND st LIKE 'CANCEL%'),
    'appeals', (SELECT count(*) FROM ap),
    'last_appeal_at', (SELECT max(COALESCE(appeal_started_at, created_at)) FROM ap),
    'last_appeal_status', (SELECT status FROM ap ORDER BY COALESCE(appeal_started_at, created_at) DESC LIMIT 1)
  ) INTO v_ctx;

  SELECT jsonb_build_object(
    'source', CASE WHEN upper(trim(COALESCE(d.primary_source_of_income,''))) IN ('','NA','N/A','N\A') THEN NULL ELSE trim(d.primary_source_of_income) END,
    'occupation', CASE WHEN upper(trim(COALESCE(d.occupation_business_type,''))) IN ('','NA','N/A','N\A') THEN NULL ELSE trim(d.occupation_business_type) END)
    INTO v_income FROM public.client_income_details d WHERE d.client_id = v_cid ORDER BY d.created_at DESC LIMIT 1;

  SELECT a.ra_name INTO v_ra FROM public.ra_assignments a WHERE a.client_id = v_cid AND a.status = 'active'
   ORDER BY a.created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('remark', x.remark, 'by', x.ra_name, 'outcome', x.contact_outcome, 'at', x.created_at)
           ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_remarks
    FROM (SELECT * FROM public.ra_client_remarks WHERE client_id = v_cid ORDER BY created_at DESC LIMIT 2) x;

  IF v_pan = '' THEN v_pan_shared := jsonb_build_object('count', 0, 'codes', '[]'::jsonb);
  ELSE
    SELECT jsonb_build_object('count', count(*),
             'codes', COALESCE((array_agg(o.client_id ORDER BY o.client_id) FILTER (WHERE o.client_id IS NOT NULL))[1:3], '{}'::text[]))
      INTO v_pan_shared FROM public.clients o
     WHERE o.id <> v_cid AND COALESCE(o.is_deleted,false) = false AND upper(trim(o.pan_card_number)) = v_pan;
  END IF;

  SELECT count(*) INTO v_accounts FROM public.client_binance_usernos u WHERE u.client_id = v_cid AND u.is_active;

  SELECT COALESCE(sum(x.total_amount),0), count(*) INTO v_msell_total, v_msell_count
    FROM (SELECT DISTINCT p.id, p.total_amount FROM public.terminal_purchase_sync t
            JOIN public.purchase_orders p ON p.terminal_sync_id = t.id OR p.id = t.purchase_order_id
           WHERE t.client_id = v_cid AND COALESCE(p.status,'') <> 'CANCELLED'
             AND p.order_date >= v_month_start AND p.order_date < v_next_start) x;

  WITH so AS (SELECT total_amount, order_date FROM public.sales_orders
               WHERE client_id = v_cid AND COALESCE(status,'') <> 'CANCELLED'),
  po AS (SELECT DISTINCT p.id, p.total_amount, p.order_date FROM public.terminal_purchase_sync t
           JOIN public.purchase_orders p ON p.terminal_sync_id = t.id OR p.id = t.purchase_order_id
          WHERE t.client_id = v_cid AND COALESCE(p.status,'') <> 'CANCELLED')
  SELECT jsonb_build_object(
    'status','linked',
    'client', jsonb_build_object(
      'id', c.id, 'code', c.client_id,
      'can_open_profile', (public.has_permission(auth.uid(),'clients_view'::public.app_permission)
                           OR public.has_permission(auth.uid(),'clients_manage'::public.app_permission)),
      'name', c.name, 'state', c.state, 'client_type', c.client_type,
      'since', c.date_of_onboarding, 'kyc_status', c.kyc_status, 'risk_appetite', c.risk_appetite,
      'risk_level', c.default_risk_level, 'buyer_status', c.buyer_approval_status,
      'seller_status', c.seller_approval_status, 'purpose', c.buying_purpose,
      'compliance_note', NULLIF(trim(COALESCE(c.operator_notes,'')),''),
      'assigned_operator', c.assigned_operator, 'monthly_limit', c.monthly_limit,
      'phone_masked', CASE WHEN length(v_phone) >= 4 THEN repeat('•', length(v_phone)-4) || right(v_phone,4) END,
      'pan_masked', CASE WHEN length(v_pan) = 10 THEN left(v_pan,2) || repeat('•', 6) || right(v_pan,2)
                         WHEN length(v_pan) >= 2 THEN repeat('•', length(v_pan)-2) || right(v_pan,2) END,
      'buyer_approved_at', c.buyer_approved_at, 'seller_approved_at', c.seller_approved_at,
      'relationship_associate', v_ra,
      'income', v_income),
    'month', jsonb_build_object('buy_total', v_buy_total, 'buy_count', v_buy_count,
                 'pending_total', v_pend_total, 'pending_count', v_pend_count, 'this_order_counted', v_counted,
                 'sell_total', v_msell_total, 'sell_count', v_msell_count),
    'history', (SELECT jsonb_build_object('buy_count', count(*), 'buy_total', COALESCE(sum(total_amount),0),
                  'first_buy', min(order_date), 'last_buy', max(order_date)) FROM so)
             || (SELECT jsonb_build_object('sell_count', count(*), 'sell_total', COALESCE(sum(total_amount),0),
                  'first_sell', min(order_date), 'last_sell', max(order_date)) FROM po),
    'banks', COALESCE((SELECT jsonb_agg(jsonb_build_object('bank', b.bank_name, 'last4', b.last_four_digits) ORDER BY b.created_at)
                FROM public.client_bank_details b WHERE b.client_id = v_cid), '[]'::jsonb),
    'documents', (SELECT jsonb_build_object(
                  'count', count(*) FILTER (WHERE lower(COALESCE(document_type,'')) <> 'communication_attachment'),
                  'types', COALESCE(jsonb_agg(DISTINCT lower(document_type)) FILTER (WHERE document_type IS NOT NULL), '[]'::jsonb),
                  'aadhaar', bool_or(lower(document_type)='aadhaar') IS TRUE,
                  'pan', (bool_or(lower(document_type)='pan') IS TRUE) OR v_pan <> '',
                  'vkyc', bool_or(lower(document_type)='vkyc_video') IS TRUE,
                  'bank_statement', bool_or(lower(document_type)='bank_statement') IS TRUE,
                  'source_of_fund', bool_or(lower(document_type)='source_of_fund') IS TRUE)
                FROM public.client_kyc_documents WHERE client_id = v_cid AND deleted_at IS NULL),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('note', n.note, 'by', n.created_by_name, 'at', n.created_at) ORDER BY n.created_at DESC)
                FROM (SELECT * FROM public.client_operator_notes WHERE client_id = v_cid ORDER BY created_at DESC LIMIT 3) n), '[]'::jsonb),
    'limit_request_pending', EXISTS (SELECT 1 FROM public.client_limit_requests lr WHERE lr.client_id = v_cid
                AND upper(lr.status) = 'PENDING'),
    'order_context', v_ctx,
    'ra_remarks', v_remarks,
    'pan_shared', v_pan_shared,
    'binance_accounts', v_accounts
  ) INTO r;
  RETURN r;
END $function$;