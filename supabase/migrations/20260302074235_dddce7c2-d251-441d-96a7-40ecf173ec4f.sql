-- Add destructive permission types per module
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'erp_destructive';
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'terminal_destructive';
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'bams_destructive';
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'clients_destructive';
ALTER TYPE app_permission ADD VALUE IF NOT EXISTS 'stock_destructive';