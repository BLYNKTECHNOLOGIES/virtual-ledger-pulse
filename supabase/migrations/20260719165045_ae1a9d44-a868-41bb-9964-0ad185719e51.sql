DO $$
DECLARE
  v_onboarding_id uuid := '8a047792-fd75-47ed-ae36-803ee3cb01a6';
  v_employee_id uuid := '07bf450f-06aa-4120-98dc-181e47473b2a';
  v_user_id uuid := '95ffbef0-9e7e-4d09-a1ba-bb976376ce24';
  v_now timestamptz := now();
BEGIN
  UPDATE public.hr_employees
  SET user_id = v_user_id,
      updated_at = v_now
  WHERE id = v_employee_id
    AND (user_id IS NULL OR user_id = v_user_id);

  UPDATE public.hr_employee_onboarding
  SET current_stage = 5,
      status = 'stage_4',
      employee_id = v_employee_id,
      stage_completions = jsonb_set(
        jsonb_set(
          coalesce(stage_completions, '{}'::jsonb),
          '{stage_3}',
          coalesce(stage_completions->'stage_3', jsonb_build_object('completed_at', v_now, 'completed_by', null, 'repaired', true)),
          true
        ),
        '{stage_4}',
        coalesce(stage_completions->'stage_4', jsonb_build_object('completed_at', v_now, 'completed_by', null, 'repaired', true)),
        true
      ),
      updated_at = v_now
  WHERE id = v_onboarding_id
    AND status <> 'completed';
END $$;