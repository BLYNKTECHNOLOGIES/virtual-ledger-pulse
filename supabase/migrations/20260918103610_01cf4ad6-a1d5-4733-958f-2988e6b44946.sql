ALTER TYPE public.cbt_section_type ADD VALUE IF NOT EXISTS 'mental_maths';
ALTER TYPE public.cbt_section_type ADD VALUE IF NOT EXISTS 'memory_recall';

ALTER TABLE public.cbt_attempt_items ALTER COLUMN question_version_id DROP NOT NULL;
ALTER TABLE public.cbt_attempt_items ADD COLUMN IF NOT EXISTS generated_content jsonb;
ALTER TABLE public.cbt_attempt_items ADD COLUMN IF NOT EXISTS generated_key jsonb;