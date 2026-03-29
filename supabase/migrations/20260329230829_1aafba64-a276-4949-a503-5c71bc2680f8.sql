ALTER TABLE hr_candidate_tasks ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE hr_candidate_tasks ALTER COLUMN candidate_task_id DROP NOT NULL;