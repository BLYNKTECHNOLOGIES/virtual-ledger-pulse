CREATE OR REPLACE FUNCTION public.get_terminal_order_client(p_order_number text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uno text; v_cid uuid; c public.clients%ROWTYPE;
  v_month_start date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_phone text; v_pan text; r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_client_kyc(auth.uid()) THEN
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

  WITH so AS (SELECT total_amount, order_date FROM public.sales_orders
               WHERE client_id = v_cid AND COALESCE(status,'') <> 'CANCELLED'),
  po AS (SELECT DISTINCT p.id, p.total_amount, p.order_date FROM public.terminal_purchase_sync t
           JOIN public.purchase_orders p ON p.terminal_sync_id = t.id OR p.id = t.purchase_order_id
          WHERE t.client_id = v_cid AND COALESCE(p.status,'') <> 'CANCELLED')
  SELECT jsonb_build_object(
    'status','linked',
    'client', jsonb_build_object(
      'id', c.id, 'code', c.client_id, 'name', c.name, 'state', c.state, 'client_type', c.client_type,
      'since', c.date_of_onboarding, 'kyc_status', c.kyc_status, 'risk_appetite', c.risk_appetite,
      'risk_level', c.default_risk_level, 'buyer_status', c.buyer_approval_status,
      'seller_status', c.seller_approval_status, 'purpose', c.buying_purpose,
      'compliance_note', NULLIF(trim(COALESCE(c.operator_notes,'')),''),
      'assigned_operator', c.assigned_operator, 'monthly_limit', c.monthly_limit,
      'phone_masked', CASE WHEN length(v_phone) >= 4 THEN repeat('•', length(v_phone)-4) || right(v_phone,4) END,
      'pan_masked', CASE WHEN length(v_pan) >= 4 THEN left(v_pan,2) || repeat('•', length(v_pan)-4) || right(v_pan,2) END),
    'month', (SELECT jsonb_build_object('buy_total', COALESCE(sum(total_amount),0), 'buy_count', count(*)) FROM so WHERE order_date >= v_month_start),
    'history', (SELECT jsonb_build_object('buy_count', count(*), 'buy_total', COALESCE(sum(total_amount),0),
                  'first_buy', min(order_date), 'last_buy', max(order_date)) FROM so)
             || (SELECT jsonb_build_object('sell_count', count(*), 'sell_total', COALESCE(sum(total_amount),0),
                  'first_sell', min(order_date), 'last_sell', max(order_date)) FROM po),
    'banks', COALESCE((SELECT jsonb_agg(jsonb_build_object('bank', b.bank_name, 'last4', b.last_four_digits) ORDER BY b.created_at)
                FROM public.client_bank_details b WHERE b.client_id = v_cid), '[]'::jsonb),
    'documents', (SELECT jsonb_build_object('count', count(*),
                  'aadhaar', bool_or(lower(document_type)='aadhaar') IS TRUE,
                  'pan', (bool_or(lower(document_type)='pan') IS TRUE) OR v_pan <> '',
                  'vkyc', bool_or(lower(document_type)='vkyc_video') IS TRUE,
                  'bank_statement', bool_or(lower(document_type)='bank_statement') IS TRUE,
                  'source_of_fund', bool_or(lower(document_type)='source_of_fund') IS TRUE)
                FROM public.client_kyc_documents WHERE client_id = v_cid AND deleted_at IS NULL),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('note', n.note, 'by', n.created_by_name, 'at', n.created_at) ORDER BY n.created_at DESC)
                FROM (SELECT * FROM public.client_operator_notes WHERE client_id = v_cid ORDER BY created_at DESC LIMIT 3) n), '[]'::jsonb),
    'limit_request_pending', EXISTS (SELECT 1 FROM public.client_limit_requests lr WHERE lr.client_id = v_cid
                AND upper(COALESCE(lr.status,'')) NOT IN ('APPROVED','REJECTED'))
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_terminal_order_client(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_terminal_order_client(text) TO authenticated;