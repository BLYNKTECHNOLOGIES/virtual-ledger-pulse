-- CRON-V6-03: CompOff Expiry Cleanup System

CREATE OR REPLACE FUNCTION fn_expire_compoff_allocations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit RECORD;
  v_expired_count INTEGER := 0;
BEGIN
  FOR v_credit IN
    SELECT cc.id AS credit_id, cc.employee_id, cc.credit_date
    FROM hr_compoff_credits cc
    WHERE cc.status = 'approved'
      AND cc.expires_at IS NOT NULL
      AND cc.expires_at < now()
  LOOP
    UPDATE hr_leave_allocations
    SET available_days = 0,
        updated_at = now()
    WHERE employee_id = v_credit.employee_id
      AND leave_type_id IN (
        SELECT id FROM hr_leave_types WHERE code = 'CO'
      )
      AND available_days > 0;

    UPDATE hr_compoff_credits
    SET status = 'expired',
        updated_at = now()
    WHERE id = v_credit.credit_id;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RAISE NOTICE 'CompOff expiry: expired % credits', v_expired_count;
END;
$$;

SELECT cron.schedule(
  'daily-compoff-expiry',
  '0 2 * * *',
  'SELECT fn_expire_compoff_allocations()'
);