DO $do$
DECLARE
  def text;
  old_unsynced text := '(x.is_one_time AND (x.razorpay_pushed_at IS NULL OR x.razorpay_push_error IS NOT NULL))';
  new_unsynced text := '(x.is_one_time AND COALESCE(x.payout_channel, '''') <> ''outside_payroll'' AND (x.razorpay_pushed_at IS NULL OR x.razorpay_push_error IS NOT NULL))';
  old_total text := 'COALESCE(SUM(x.one_time_amount) FILTER (WHERE x.one_time_amount IS NOT NULL), 0)::numeric AS one_time_total';
  new_total text := 'COALESCE(SUM(x.one_time_amount) FILTER (WHERE x.one_time_amount IS NOT NULL AND COALESCE(x.payout_channel, '''') <> ''outside_payroll''), 0)::numeric AS one_time_total,
      COALESCE(SUM(x.one_time_amount) FILTER (WHERE x.one_time_amount IS NOT NULL AND COALESCE(x.payout_channel, '''') = ''outside_payroll''), 0)::numeric AS one_time_recorded_total';
  old_json text := '''one_time_total'', (SELECT s.one_time_total FROM s3 s)))';
  new_json text := '''one_time_total'', (SELECT s.one_time_total FROM s3 s),
                          ''one_time_recorded_total'', (SELECT s.one_time_recorded_total FROM s3 s)))';
BEGIN
  def := pg_get_functiondef('public.hr_cockpit_month_state(date)'::regprocedure);

  IF position(old_unsynced in def) = 0 OR position(old_total in def) = 0 OR position(old_json in def) = 0 THEN
    RAISE EXCEPTION 'hr_cockpit_month_state does not match expected shape - aborting rewrite';
  END IF;

  def := replace(def, old_unsynced, new_unsynced);
  def := replace(def, old_total, new_total);
  def := replace(def, old_json, new_json);

  EXECUTE def;
END
$do$;