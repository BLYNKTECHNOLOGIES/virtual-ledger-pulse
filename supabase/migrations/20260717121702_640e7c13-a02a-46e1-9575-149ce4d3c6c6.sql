DELETE FROM public.hr_onboarding_task_employees
WHERE task_id IN (
  SELECT id FROM public.hr_onboarding_tasks
  WHERE stage_id = 'a0000001-0000-0000-0000-000000000003'
    AND title ILIKE 'NDA signed'
);

DELETE FROM public.hr_onboarding_tasks
WHERE stage_id = 'a0000001-0000-0000-0000-000000000003'
  AND title ILIKE 'NDA signed';