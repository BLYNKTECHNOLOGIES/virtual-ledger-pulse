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
  v_ms_ms bigint; v_ns_ms bigint;
  v_phone text; v_pan text; r jsonb;
  v_buy_total numeric; v_buy_count bigint; v_pend_total numeric; v_pend_count bigint; v_counted boolean;
BEGIN
  -- TO-CL-3: anyone who can open Terminal Orders or Appeals (same gate as those pages; Super Admin via
  -- has_terminal_permission), or anyone with ERP client access.
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

  WITH so AS (SELECT total_amount, order_date FROM public.sales_orders
               WHERE client_id = v_cid AND COALESCE(status,'') <> 'CANCELLED'),
  po AS (SELECT DISTINCT p.id, p.total_amount, p.order_date FROM public.terminal_purchase_sync t
           JOIN public.purchase_orders p ON p.terminal_sync_id = t.id OR p.id = t.purchase_order_id
          WHERE t.client_id = v_cid AND COALESCE(p.status,'') <> 'CANCELLED')
  SELECT jsonb_build_object(
    'status','linked',
    'client', jsonb_build_object(
      'id', c.id, 'code', c.client_id,
      -- TO-CL-3: same rule as the /clients/:id gate (clients_view or clients_manage; admins via has_permission)
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
                         WHEN length(v_pan) >= 2 THEN repeat('•', length(v_pan)-2) || right(v_pan,2) END),
    'month', jsonb_build_object('buy_total', v_buy_total, 'buy_count', v_buy_count,
                 'pending_total', v_pend_total, 'pending_count', v_pend_count, 'this_order_counted', v_counted),
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
                AND upper(lr.status) = 'PENDING')
  ) INTO r;
  RETURN r;
END $function$;