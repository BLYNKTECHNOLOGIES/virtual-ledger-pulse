
UPDATE public.hr_employees
   SET is_active = false,
       updated_at = now()
 WHERE id = '07bf450f-06aa-4120-98dc-181e47473b2a';

UPDATE public.hr_employee_onboarding
   SET status = 'in_progress',
       current_stage = 5,
       stage_completions = COALESCE(stage_completions, '{}'::jsonb) - 'stage_5',
       updated_at = now()
 WHERE id = '8a047792-fd75-47ed-ae36-803ee3cb01a6';
