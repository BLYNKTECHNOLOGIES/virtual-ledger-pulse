CREATE OR REPLACE FUNCTION public.reject_product_conversion(p_conversion_id UUID, p_rejected_by UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status != 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval.');
  END IF;

  UPDATE erp_product_conversions
  SET status = 'REJECTED',
      rejected_by = p_rejected_by,
      rejected_at = now(),
      rejection_reason = p_reason
  WHERE id = p_conversion_id;

  INSERT INTO system_action_log (action_type, entity_type, entity_id, module, performed_by, metadata)
  VALUES ('stock.conversion_rejected', 'erp_conversion', p_conversion_id, 'stock', p_rejected_by,
    jsonb_build_object('reference_no', v_conv.reference_no, 'reason', p_reason));

  RETURN jsonb_build_object('success', true);
END;
$$;