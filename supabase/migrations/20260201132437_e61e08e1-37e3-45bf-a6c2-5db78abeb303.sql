-- EMS permissions exist in the UI but were missing from the app_permission enum, causing role save RPCs to fail.
-- Add them safely.

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'ems_view';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'ems_manage';
