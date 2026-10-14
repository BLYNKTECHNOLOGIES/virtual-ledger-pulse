-- LMS permission keys (own migration: new enum values must be committed before use).
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'hrms_lms_view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'hrms_lms_manage';
