
-- First migration: Add the missing enum value
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'dashboard_view';
