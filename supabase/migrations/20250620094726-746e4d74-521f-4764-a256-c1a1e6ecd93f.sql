
-- Add missing permissions to the app_permission enum
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_bams';
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'view_stock_management';
