DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'app_permission'::regtype AND enumlabel = 'ra_assign') THEN
    ALTER TYPE app_permission ADD VALUE 'ra_assign';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'app_permission'::regtype AND enumlabel = 'ra_dashboard_view') THEN
    ALTER TYPE app_permission ADD VALUE 'ra_dashboard_view';
  END IF;
END$$;