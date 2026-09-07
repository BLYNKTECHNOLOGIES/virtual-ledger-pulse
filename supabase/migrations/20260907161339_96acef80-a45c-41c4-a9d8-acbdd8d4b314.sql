
-- 1) Registry becomes permanent memory of counterparty names
ALTER TABLE public.order_nickname_registry
  ALTER COLUMN expires_at DROP NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT NULL;

UPDATE public.order_nickname_registry SET expires_at = NULL WHERE expires_at IS NOT NULL;

-- cleanup job must never delete rows that have no expiry
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-order-nickname-registry');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- 2) Guard: never let a masked name overwrite a known real name
CREATE OR REPLACE FUNCTION public.trg_preserve_counterparty_nickname()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_nick text;
  v_reg_verified text;
  v_new_masked boolean;
BEGIN
  v_new_masked := (NEW.counter_part_nick_name IS NULL
                   OR btrim(NEW.counter_part_nick_name) = ''
                   OR NEW.counter_part_nick_name LIKE '%*%');

  IF TG_OP = 'UPDATE' AND v_new_masked
     AND OLD.counter_part_nick_name IS NOT NULL
     AND OLD.counter_part_nick_name NOT LIKE '%*%'
     AND btrim(OLD.counter_part_nick_name) <> '' THEN
    NEW.counter_part_nick_name := OLD.counter_part_nick_name;
    v_new_masked := false;
  END IF;

  IF v_new_masked THEN
    SELECT nickname, verified_name INTO v_reg_nick, v_reg_verified
    FROM public.order_nickname_registry
    WHERE order_number = NEW.order_number
    LIMIT 1;
    IF v_reg_nick IS NOT NULL AND v_reg_nick NOT LIKE '%*%' THEN
      NEW.counter_part_nick_name := v_reg_nick;
      IF (NEW.verified_name IS NULL OR btrim(NEW.verified_name) = '') AND v_reg_verified IS NOT NULL THEN
        NEW.verified_name := v_reg_verified;
      END IF;
    END IF;
  END IF;

  -- keep a known verified name from being blanked by a later sync
  IF TG_OP = 'UPDATE'
     AND (NEW.verified_name IS NULL OR btrim(NEW.verified_name) = '')
     AND OLD.verified_name IS NOT NULL AND btrim(OLD.verified_name) <> '' THEN
    NEW.verified_name := OLD.verified_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_counterparty_nickname ON public.binance_order_history;
CREATE TRIGGER preserve_counterparty_nickname
BEFORE INSERT OR UPDATE ON public.binance_order_history
FOR EACH ROW EXECUTE FUNCTION public.trg_preserve_counterparty_nickname();

-- 3) Whenever a real name is known on an order, remember it forever
CREATE OR REPLACE FUNCTION public.trg_remember_counterparty_nickname()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.counter_part_nick_name IS NOT NULL
     AND btrim(NEW.counter_part_nick_name) <> ''
     AND NEW.counter_part_nick_name NOT LIKE '%*%' THEN
    INSERT INTO public.order_nickname_registry
      (order_number, exchange_account_id, nickname, verified_name, trade_type, captured_at, expires_at)
    VALUES
      (NEW.order_number, NEW.exchange_account_id, NEW.counter_part_nick_name,
       NULLIF(btrim(COALESCE(NEW.verified_name,'')), ''), NEW.trade_type, now(), NULL)
    ON CONFLICT (order_number) DO UPDATE
      SET nickname = EXCLUDED.nickname,
          verified_name = COALESCE(EXCLUDED.verified_name, public.order_nickname_registry.verified_name),
          exchange_account_id = COALESCE(EXCLUDED.exchange_account_id, public.order_nickname_registry.exchange_account_id),
          trade_type = COALESCE(EXCLUDED.trade_type, public.order_nickname_registry.trade_type),
          expires_at = NULL;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS remember_counterparty_nickname ON public.binance_order_history;
CREATE TRIGGER remember_counterparty_nickname
AFTER INSERT OR UPDATE OF counter_part_nick_name ON public.binance_order_history
FOR EACH ROW EXECUTE FUNCTION public.trg_remember_counterparty_nickname();

-- 4) Backfill: heal masked orders from the registry
UPDATE public.binance_order_history h
SET counter_part_nick_name = r.nickname,
    verified_name = COALESCE(NULLIF(btrim(COALESCE(h.verified_name,'')),''), r.verified_name)
FROM public.order_nickname_registry r
WHERE r.order_number = h.order_number
  AND r.nickname IS NOT NULL AND r.nickname NOT LIKE '%*%'
  AND (h.counter_part_nick_name IS NULL OR h.counter_part_nick_name LIKE '%*%' OR btrim(h.counter_part_nick_name) = '');

-- 5) Backfill registry from the historical identity table
INSERT INTO public.order_nickname_registry (order_number, nickname, verified_name, trade_type, captured_at, expires_at)
SELECT c.order_number, c.nickname, NULLIF(btrim(COALESCE(c.verified_name,'')),''), NULL, now(), NULL
FROM public.cp_order_identity c
WHERE c.nickname IS NOT NULL AND c.nickname NOT LIKE '%*%'
ON CONFLICT (order_number) DO NOTHING;
