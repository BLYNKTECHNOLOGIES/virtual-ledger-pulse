
-- Phase 28: W30 (RLS) + W32 (Deletion Guard)

-- W30: ad_pricing_rules — replace open policy with terminal-gated
DROP POLICY IF EXISTS "authenticated_all_ad_pricing_rules" ON public.ad_pricing_rules;

CREATE POLICY "terminal_select_ad_pricing_rules" ON public.ad_pricing_rules
  FOR SELECT TO authenticated
  USING (public.verify_terminal_access(auth.uid()));

CREATE POLICY "terminal_insert_ad_pricing_rules" ON public.ad_pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

CREATE POLICY "terminal_update_ad_pricing_rules" ON public.ad_pricing_rules
  FOR UPDATE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'))
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

CREATE POLICY "terminal_delete_ad_pricing_rules" ON public.ad_pricing_rules
  FOR DELETE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

-- W30: ad_rest_timer — replace open policy with terminal-gated
DROP POLICY IF EXISTS "authenticated_all_ad_rest_timer" ON public.ad_rest_timer;

CREATE POLICY "terminal_select_ad_rest_timer" ON public.ad_rest_timer
  FOR SELECT TO authenticated
  USING (public.verify_terminal_access(auth.uid()));

CREATE POLICY "terminal_insert_ad_rest_timer" ON public.ad_rest_timer
  FOR INSERT TO authenticated
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

CREATE POLICY "terminal_update_ad_rest_timer" ON public.ad_rest_timer
  FOR UPDATE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'))
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

CREATE POLICY "terminal_delete_ad_rest_timer" ON public.ad_rest_timer
  FOR DELETE TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_pricing_manage'));

-- W32: Add deletion_approved_by column
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS deletion_approved_by uuid;

COMMENT ON COLUMN public.hr_employees.deletion_approved_by IS 'UUID of user who approved scheduled account deletion. Must be non-null for auto-deletion to proceed.';

-- W32: Recreate function with approval guard
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
      AND deletion_approved_by IS NOT NULL
  LOOP
    BEGIN
      SELECT public.delete_user_with_cleanup(emp.user_id) INTO _result;
      
      IF (_result->>'success')::boolean THEN
        UPDATE public.hr_employees 
        SET user_id = NULL, account_deletion_date = NULL, deletion_approved_by = NULL
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
