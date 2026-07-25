
-- Promote a scheduled salary revision on/after its effective date.
CREATE OR REPLACE FUNCTION public.promote_scheduled_salary_revision(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.hr_salary_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.hr_salary_revisions WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scheduled revision % not found', p_row_id;
  END IF;

  IF v_row.status <> 'SCHEDULED' THEN
    RETURN jsonb_build_object('status', v_row.status, 'id', v_row.id, 'noop', true);
  END IF;

  IF v_row.effective_from > CURRENT_DATE THEN
    RETURN jsonb_build_object('status','SCHEDULED','id',v_row.id,'reason','not_yet_due','effective_from',v_row.effective_from);
  END IF;

  -- Seed session vars so the hr_employees update trigger records history properly.
  PERFORM set_config('app.revision_type', v_row.revision_type, true);
  PERFORM set_config('app.revision_reason', COALESCE(v_row.revision_reason,''), true);
  PERFORM set_config('app.revision_approved_by', COALESCE(v_row.approved_by,''), true);
  PERFORM set_config('app.revision_effective_from', v_row.effective_from::text, true);
  -- Signal the history trigger that this promotion is backed by an already-existing
  -- SCHEDULED row so it does not insert a duplicate revision row.
  PERFORM set_config('app.revision_source_id', v_row.id::text, true);

  UPDATE public.hr_employees
     SET basic_salary = COALESCE(v_row.new_basic, basic_salary),
         total_salary = v_row.new_total,
         updated_at = now()
   WHERE id = v_row.employee_id;

  UPDATE public.hr_salary_revisions
     SET status = 'APPLIED', updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('status','APPLIED','id',v_row.id,'employee_id',v_row.employee_id,'effective_from',v_row.effective_from);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_scheduled_salary_revision(uuid) TO service_role;

-- Daily cron: promote due scheduled revisions and push to RazorpayX
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'hr-promote-scheduled-salary-revisions-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'hr-promote-scheduled-salary-revisions-daily',
    '15 1 * * *',  -- 01:15 UTC daily = 06:45 IST
    $CRON$
    SELECT net.http_post(
      url:='https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-promote-scheduled-salary-revisions',
      headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
    $CRON$
  );
END $$;
