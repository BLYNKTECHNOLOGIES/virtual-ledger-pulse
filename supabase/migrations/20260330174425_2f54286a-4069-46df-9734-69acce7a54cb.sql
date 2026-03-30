-- 1. Drop the dangerous bypass function
DROP FUNCTION IF EXISTS public.update_settlement_status_bypass_triggers(uuid[], text, timestamptz);

-- 2. Create trigger function for failed spot trades
CREATE OR REPLACE FUNCTION public.trigger_erp_task_on_failed_spot_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.status = 'FAILED' AND (OLD.status IS NULL OR OLD.status != 'FAILED') THEN
    INSERT INTO erp_tasks (title, description, priority, status, tags)
    VALUES (
      'Spot Trade Failed: ' || NEW.symbol || ' ' || NEW.side,
      'Symbol: ' || NEW.symbol || E'\n' ||
      'Side: ' || NEW.side || E'\n' ||
      'Quantity: ' || COALESCE(NEW.quantity::text, 'N/A') || E'\n' ||
      'Error: ' || COALESCE(NEW.error_message, 'Unknown') || E'\n' ||
      'Trade ID: ' || NEW.id::text,
      'high',
      'open',
      ARRAY['spot-trade', 'auto-generated']
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger
CREATE TRIGGER trg_failed_spot_trade_erp_task
AFTER INSERT OR UPDATE ON spot_trade_history
FOR EACH ROW
EXECUTE FUNCTION trigger_erp_task_on_failed_spot_trade();