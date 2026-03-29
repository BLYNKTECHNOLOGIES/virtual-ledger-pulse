-- Add scheduled account deletion date to hr_employees
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS account_deletion_date date;

COMMENT ON COLUMN public.hr_employees.account_deletion_date IS 'Date after which the linked ERP/terminal user account should be permanently deleted';

-- Create an RPC to process scheduled deletions (called by daily cron)
CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp RECORD;
  _result json;
  _deleted_count int := 0;
  _errors text[] := '{}';
BEGIN
  FOR emp IN
    SELECT id, user_id, first_name, last_name, badge_id
    FROM public.hr_employees
    WHERE account_deletion_date IS NOT NULL
      AND account_deletion_date <= CURRENT_DATE
      AND user_id IS NOT NULL
      AND is_active = false
  LOOP
    BEGIN
      SELECT public.delete_user_with_cleanup(emp.user_id) INTO _result;
      
      IF (_result->>'success')::boolean THEN
        UPDATE public.hr_employees 
        SET user_id = NULL, account_deletion_date = NULL 
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
            'reason', 'Scheduled post-offboarding account deletion'
          )::jsonb,
          'SYSTEM'
        );
      ELSE
        _errors := array_append(_errors, emp.badge_id || ': ' || (_result->>'error'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _errors := array_append(_errors, emp.badge_id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN json_build_object(
    'deleted_count', _deleted_count,
    'errors', _errors,
    'processed_at', now()
  );
END;
$$;