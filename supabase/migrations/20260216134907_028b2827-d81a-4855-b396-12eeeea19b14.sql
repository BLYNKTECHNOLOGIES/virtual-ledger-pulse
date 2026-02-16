
-- 1. Auto-create wallet_asset_positions when a new wallet_asset_balances row is inserted
--    and auto-update qty_on_hand when balance changes (if position has zero qty)
CREATE OR REPLACE FUNCTION public.sync_asset_position_on_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Upsert: create position if not exists, but do NOT overwrite non-zero qty_on_hand
  -- (non-zero means conversions have been tracking it properly)
  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt, updated_at)
  VALUES (
    NEW.wallet_id,
    NEW.asset_code,
    NEW.balance,
    CASE WHEN NEW.asset_code IN ('USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD') THEN NEW.balance ELSE 0 END,
    CASE WHEN NEW.asset_code IN ('USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD') THEN 1.0 ELSE 0 END,
    now()
  )
  ON CONFLICT (wallet_id, asset_code)
  DO UPDATE SET
    -- Only sync qty if position was at zero (not yet seeded / tracking)
    qty_on_hand = CASE
      WHEN wallet_asset_positions.qty_on_hand = 0 AND wallet_asset_positions.cost_pool_usdt = 0
      THEN EXCLUDED.qty_on_hand
      ELSE wallet_asset_positions.qty_on_hand
    END,
    cost_pool_usdt = CASE
      WHEN wallet_asset_positions.qty_on_hand = 0 AND wallet_asset_positions.cost_pool_usdt = 0
      THEN EXCLUDED.cost_pool_usdt
      ELSE wallet_asset_positions.cost_pool_usdt
    END,
    avg_cost_usdt = CASE
      WHEN wallet_asset_positions.qty_on_hand = 0 AND wallet_asset_positions.cost_pool_usdt = 0
      THEN EXCLUDED.avg_cost_usdt
      ELSE wallet_asset_positions.avg_cost_usdt
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Attach trigger to wallet_asset_balances
DROP TRIGGER IF EXISTS trg_sync_asset_position ON wallet_asset_balances;
CREATE TRIGGER trg_sync_asset_position
AFTER INSERT OR UPDATE ON wallet_asset_balances
FOR EACH ROW
EXECUTE FUNCTION sync_asset_position_on_balance_change();
