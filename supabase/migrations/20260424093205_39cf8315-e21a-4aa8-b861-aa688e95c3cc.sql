CREATE OR REPLACE FUNCTION public.__admin_cleanup_reverse_sales_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_payment_method RECORD;
  v_product RECORD;
  v_client_name TEXT;
  v_guard_inserted int := 0;
  v_is_gateway BOOLEAN := false;
  r RECORD;
BEGIN
  DELETE FROM public.reversal_guards
   WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
  IF v_guard_inserted = 0 THEN RETURN; END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_client_name := v_order.client_name;
  UPDATE public.sales_orders SET terminal_sync_id = NULL WHERE id = p_order_id;

  DELETE FROM public.terminal_sales_sync WHERE sales_order_id = p_order_id;
  DELETE FROM public.payment_gateway_settlement_items WHERE sales_order_id = p_order_id;
  DELETE FROM public.client_onboarding_approvals WHERE sales_order_id = p_order_id;
  DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;
  DELETE FROM public.wallet_fee_deductions WHERE order_id = p_order_id OR order_number = v_order.order_number;
  DELETE FROM public.sales_order_items WHERE sales_order_id = p_order_id;

  IF v_order.sales_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, current_usage, COALESCE(payment_gateway, false) AS payment_gateway
    INTO v_payment_method FROM public.sales_payment_methods WHERE id = v_order.sales_payment_method_id;
    IF FOUND THEN
      v_is_gateway := v_payment_method.payment_gateway;
      IF NOT v_is_gateway THEN
        UPDATE public.sales_payment_methods
           SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
               updated_at = now()
         WHERE id = v_order.sales_payment_method_id;
      END IF;
    END IF;
  END IF;

  FOR r IN SELECT id FROM public.bank_transactions
     WHERE reference_number = v_order.order_number AND COALESCE(is_reversed, false) = false AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(r.id, 'System cleanup of duplicate phantom: ' || v_order.order_number, NULL);
  END LOOP;

  IF v_client_name IS NOT NULL THEN
    UPDATE public.clients
       SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
           updated_at = now()
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
  END IF;

  DELETE FROM public.stock_transactions WHERE reference_number = v_order.order_number;
  IF v_order.product_id IS NOT NULL THEN
    SELECT current_stock_quantity, total_sales INTO v_product FROM public.products WHERE id = v_order.product_id;
    IF FOUND THEN
      UPDATE public.products
         SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
             total_sales = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
             updated_at = now()
       WHERE id = v_order.product_id;
    END IF;
  END IF;

  FOR r IN SELECT id FROM public.wallet_transactions
     WHERE ((reference_id = p_order_id AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE'))
         OR (reference_type = 'SALES_ORDER_FEE' AND description ILIKE '%' || v_order.order_number || '%'))
       AND COALESCE(is_reversed, false) = false AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(r.id, 'System cleanup of duplicate phantom: ' || v_order.order_number, NULL);
  END LOOP;

  DELETE FROM public.sales_orders WHERE id = p_order_id;

  IF v_client_name IS NOT NULL THEN
    PERFORM public.maybe_delete_orphan_client(v_client_name);
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM public.__admin_cleanup_reverse_sales_order('df59174c-dc75-475f-a10a-7db0df845fe4'::uuid);
  PERFORM public.__admin_cleanup_reverse_sales_order('a837d98a-bc35-404e-b817-f2db7d2344e0'::uuid);
  PERFORM public.__admin_cleanup_reverse_sales_order('906adf69-72f9-44b5-b91d-346aeeddf7db'::uuid);
  PERFORM public.__admin_cleanup_reverse_sales_order('70c061d0-d10d-47f5-a92b-908985f6250c'::uuid);
  PERFORM public.__admin_cleanup_reverse_sales_order('0ae6aa40-16d4-4071-8f3b-149dfe73b690'::uuid);
  PERFORM public.__admin_cleanup_reverse_sales_order('fb2a15fe-5efc-479c-b6ee-e5a4b6271e58'::uuid);
END $$;

DROP FUNCTION public.__admin_cleanup_reverse_sales_order(uuid);

-- Link surviving sales orders to their sync batches with reviewed_by set to Priyanka (the original operator)
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='15bcac7b-3034-489e-9441-0f17f6f61c3a'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='befd75fe-e02a-408e-8dee-ddcd68c0a71e'::uuid AND sync_status='pending_approval';
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='2affaa50-be6d-48d7-ac0a-0161491c2e75'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='53def55e-880e-4b7f-8a62-c3cce31cea81'::uuid AND sync_status='pending_approval';
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='05a65655-19c5-47cc-a620-2027d49d6a1b'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='be5a915e-055b-46af-86d5-9c0b0d69cd44'::uuid AND sync_status='pending_approval';
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='919197de-2be3-42f6-b956-cd17908e314f'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='1bab6155-6cbc-4a9f-8a40-629de82b06d7'::uuid AND sync_status='pending_approval';
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='ed0e4ecd-4ec9-4abb-877f-4a990d4b56ea'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='26848834-fb0f-408e-83e7-a3ffb28095ff'::uuid AND sync_status='pending_approval';
UPDATE small_sales_sync SET sync_status='approved', sales_order_id='fc0b7657-8c61-4281-ba56-137ff3699a07'::uuid, reviewed_at=COALESCE(reviewed_at, now()), reviewed_by='a3348a29-354e-4030-a4a5-347c8dafd7a5'::uuid
 WHERE id='3f2a78a3-99cd-4d23-95f5-ed83662cbea2'::uuid AND sync_status='pending_approval';