

# Phase 21 Outstanding Items — Fix Plan

## Item 1: Drop `update_settlement_status_bypass_triggers` (Security)

**Problem:** The function `update_settlement_status_bypass_triggers` still exists in the live database. It uses `SET session_replication_role = replica` to disable all triggers when updating settlement status — identical risk to the already-dropped `update_settlement_bypass_all_triggers`. It is not called from any frontend code.

**Fix:** Single SQL migration:
```sql
DROP FUNCTION IF EXISTS public.update_settlement_status_bypass_triggers(uuid[], text, timestamptz);
```

---

## Item 2: Create ERP task trigger for FAILED spot trades (B50)

**Problem:** When a spot trade fails (status = 'FAILED'), no ERP task is created to alert operations. There are currently 7 FAILED trades sitting unactioned in the database.

**Fix:** Create a database trigger on `spot_trade_history` that fires on UPDATE when `status` changes to `'FAILED'`. The trigger will insert an `erp_tasks` row with:
- `title`: "Spot Trade Failed: {symbol} {side} — {error_message}"
- `priority`: "high"
- `status`: "open"
- `tags`: `['spot-trade', 'auto-generated']`
- `description`: Details including symbol, side, quantity, error message, and trade ID

Additionally, backfill the 7 existing FAILED trades by inserting ERP tasks for them via the insert tool.

### Migration SQL

```sql
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
```

### Backfill (via insert tool, not migration)

Insert 7 ERP tasks for existing FAILED spot trades using data from the query results.

---

## Summary

| # | Action | Method |
|---|--------|--------|
| 1 | Drop `update_settlement_status_bypass_triggers` | Migration |
| 2 | Create trigger function + trigger for FAILED spot trades → ERP task | Migration |
| 3 | Backfill 7 existing FAILED trades as ERP tasks | Insert tool |

No frontend changes required.

