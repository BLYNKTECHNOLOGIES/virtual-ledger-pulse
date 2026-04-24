DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'erp_action_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_action_queue;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'terminal_purchase_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_purchase_sync;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'terminal_sales_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_sales_sync;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'small_buys_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.small_buys_sync;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'small_sales_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.small_sales_sync;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'erp_product_conversions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_product_conversions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sales_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;
  END IF;
END $$;