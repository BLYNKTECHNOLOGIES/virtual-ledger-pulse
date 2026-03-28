
-- B7: Enforce single-row constraint on singleton config tables
-- Use BEFORE INSERT trigger approach (works regardless of ID)

CREATE OR REPLACE FUNCTION public.enforce_singleton_row()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM pg_class WHERE relname = TG_TABLE_NAME) > 0 THEN
    EXECUTE format('SELECT COUNT(*) FROM %I', TG_TABLE_NAME) INTO STRICT NEW;
  END IF;
  -- Simpler: just check if any row exists
  RAISE EXCEPTION 'Table "%" is a singleton config table and already contains a row. Use UPDATE instead of INSERT.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

-- Actually, a simpler approach: use a check constraint on a boolean column or a unique partial index.
-- Simplest: add a trigger per table that blocks insert if count > 0

DROP FUNCTION IF EXISTS public.enforce_singleton_row() CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_singleton_p2p_auto_pay()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.p2p_auto_pay_settings) >= 1 THEN
    RAISE EXCEPTION 'p2p_auto_pay_settings is a singleton table. Use UPDATE instead of INSERT.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_singleton_small_sales()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.small_sales_config) >= 1 THEN
    RAISE EXCEPTION 'small_sales_config is a singleton table. Use UPDATE instead of INSERT.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_singleton_small_buys()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.small_buys_config) >= 1 THEN
    RAISE EXCEPTION 'small_buys_config is a singleton table. Use UPDATE instead of INSERT.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_singleton_p2p_auto_pay
  BEFORE INSERT ON public.p2p_auto_pay_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_singleton_p2p_auto_pay();

CREATE TRIGGER trg_singleton_small_sales
  BEFORE INSERT ON public.small_sales_config
  FOR EACH ROW EXECUTE FUNCTION public.enforce_singleton_small_sales();

CREATE TRIGGER trg_singleton_small_buys
  BEFORE INSERT ON public.small_buys_config
  FOR EACH ROW EXECUTE FUNCTION public.enforce_singleton_small_buys();
