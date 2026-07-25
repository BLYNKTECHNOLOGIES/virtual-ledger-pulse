
-- 1) Trigger: auto-schedule / cancel ERP account deletion based on separation state
CREATE OR REPLACE FUNCTION public.hr_sync_separation_deletion_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- Separation approved (notice period) or completed → schedule deletion on LWD
  IF NEW.resignation_status IN ('notice_period', 'completed')
     AND NEW.last_working_day IS NOT NULL THEN
    NEW.account_deletion_date := NEW.last_working_day;
    -- Preserve prior approver if already set; else stamp current actor
    IF NEW.deletion_approved_by IS NULL THEN
      NEW.deletion_approved_by := COALESCE(v_actor, OLD.deletion_approved_by);
    END IF;
  END IF;

  -- Separation withdrawn / rejected → cancel scheduled deletion
  IF (NEW.resignation_status IS NULL
      OR NEW.resignation_status IN ('withdrawn', 'rejected'))
     AND (OLD.resignation_status IS DISTINCT FROM NEW.resignation_status) THEN
    NEW.account_deletion_date := NULL;
    NEW.deletion_approved_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_sync_separation_deletion_schedule ON public.hr_employees;
CREATE TRIGGER trg_hr_sync_separation_deletion_schedule
BEFORE UPDATE ON public.hr_employees
FOR EACH ROW
WHEN (
  OLD.resignation_status IS DISTINCT FROM NEW.resignation_status
  OR OLD.last_working_day IS DISTINCT FROM NEW.last_working_day
)
EXECUTE FUNCTION public.hr_sync_separation_deletion_schedule();

-- 2) Rewrite scheduled-deletion RPC: IST-aware, deactivates inline, no is_active guard
CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  _result json;
  _deleted_count int := 0;
  _errors text[] := '{}';
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  FOR emp IN
    SELECT id, user_id, first_name, last_name, badge_id,
           COALESCE(account_deletion_date, last_working_day) AS due_date
    FROM public.hr_employees
    WHERE user_id IS NOT NULL
      AND COALESCE(account_deletion_date, last_working_day) IS NOT NULL
      AND COALESCE(account_deletion_date, last_working_day) <= _today
      AND (
        resignation_status IN ('notice_period', 'completed')
        OR is_active = false
      )
  LOOP
    BEGIN
      -- Ensure employee is marked inactive at the moment of deletion
      UPDATE public.hr_employees
      SET is_active = false,
          resignation_status = COALESCE(NULLIF(resignation_status, 'notice_period'), 'completed')
      WHERE id = emp.id;

      SELECT public.delete_user_with_cleanup(emp.user_id) INTO _result;

      IF (_result->>'success')::boolean THEN
        UPDATE public.hr_employees
        SET user_id = NULL,
            account_deletion_date = NULL,
            deletion_approved_by = NULL
        WHERE id = emp.id;

        _deleted_count := _deleted_count + 1;

        INSERT INTO public.system_action_logs (action_type, entity_type, entity_id, details, user_name)
        VALUES (
          'auto_account_deletion',
          'hr_employee',
          emp.id,
          json_build_object(
            'employee_name', COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, ''),
            'badge_id', emp.badge_id,
            'due_date', emp.due_date,
            'reason', 'Automatic deletion on last working day'
          )::jsonb,
          'SYSTEM'
        );
      ELSE
        _errors := array_append(_errors, emp.badge_id || ': ' || (_result->>'error'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _errors := array_append(_errors, COALESCE(emp.badge_id, emp.id::text) || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN json_build_object(
    'deleted_count', _deleted_count,
    'errors', _errors,
    'processed_at', now()
  );
END;
$$;

-- 3) Schedule the job: every day at 00:15 IST (= 18:45 UTC prior day)
DO $$
BEGIN
  PERFORM cron.unschedule('hr-auto-account-deletion-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-auto-account-deletion-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'hr-auto-account-deletion-daily',
  '45 18 * * *',
  $$SELECT public.process_scheduled_account_deletions();$$
);

-- 4) Backfill: existing notice_period / completed employees with an LWD but no schedule
UPDATE public.hr_employees e
SET account_deletion_date = e.last_working_day
WHERE e.resignation_status IN ('notice_period', 'completed')
  AND e.last_working_day IS NOT NULL
  AND e.user_id IS NOT NULL
  AND e.account_deletion_date IS NULL;
