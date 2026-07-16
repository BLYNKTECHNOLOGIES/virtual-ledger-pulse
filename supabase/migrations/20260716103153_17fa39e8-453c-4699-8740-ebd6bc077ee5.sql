CREATE OR REPLACE FUNCTION public.cleanup_biometric_device_pin_after_ack(_device_serial text, _pin text, _command_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_ack boolean;
  v_user_deleted integer := 0;
  v_template_deleted integer := 0;
  v_photo_deleted integer := 0;
BEGIN
  IF _device_serial IS NULL OR btrim(_device_serial) = '' THEN
    RAISE EXCEPTION 'Device serial is required';
  END IF;

  IF _pin IS NULL OR btrim(_pin) = '' OR btrim(_pin) = '*' OR lower(btrim(_pin)) = 'all' THEN
    RAISE EXCEPTION 'A single PIN is required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.hr_biometric_device_commands c
    WHERE c.device_serial = _device_serial
      AND c.status = 'ack'
      AND c.command_text ILIKE ('%DATA DELETE USERINFO%PIN=' || btrim(_pin) || '%')
      AND (_command_id IS NULL OR c.id = _command_id)
  ) INTO v_has_ack;

  IF NOT v_has_ack THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'delete_not_acknowledged',
      'message', 'The eSSL device has not acknowledged this delete command yet.'
    );
  END IF;

  DELETE FROM public.hr_biometric_device_templates
  WHERE device_serial = _device_serial AND pin = btrim(_pin);
  GET DIAGNOSTICS v_template_deleted = ROW_COUNT;

  DELETE FROM public.hr_biometric_device_photos
  WHERE device_serial = _device_serial AND pin = btrim(_pin);
  GET DIAGNOSTICS v_photo_deleted = ROW_COUNT;

  DELETE FROM public.hr_biometric_device_users
  WHERE device_serial = _device_serial AND pin = btrim(_pin);
  GET DIAGNOSTICS v_user_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'pin', btrim(_pin),
    'device_serial', _device_serial,
    'users_deleted', v_user_deleted,
    'templates_deleted', v_template_deleted,
    'photos_deleted', v_photo_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_biometric_device_pin_after_ack(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_biometric_device_pin_after_ack(text, text, uuid) TO service_role;