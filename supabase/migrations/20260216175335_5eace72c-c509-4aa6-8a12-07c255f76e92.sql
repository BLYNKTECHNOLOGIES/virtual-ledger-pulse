
-- Fix: Resync wallet_asset_positions qty_on_hand to match wallet_asset_balances
-- This fixes drift caused by purchases crediting balances but not updating positions

-- Update existing positions where balance drifted
UPDATE wallet_asset_positions wap
SET qty_on_hand = wab.balance,
    cost_pool_usdt = CASE 
      WHEN wab.balance > 0 AND wap.avg_cost_usdt > 0 THEN wab.balance * wap.avg_cost_usdt
      ELSE wap.cost_pool_usdt
    END,
    updated_at = now()
FROM wallet_asset_balances wab
WHERE wab.wallet_id = wap.wallet_id 
  AND wab.asset_code = wap.asset_code
  AND wab.asset_code <> 'USDT'
  AND ABS(wab.balance - wap.qty_on_hand) > 0.000000001;

-- Insert positions for assets that have balances but no position record
INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
SELECT wab.wallet_id, wab.asset_code, wab.balance, 0, 0
FROM wallet_asset_balances wab
LEFT JOIN wallet_asset_positions wap ON wap.wallet_id = wab.wallet_id AND wap.asset_code = wab.asset_code
WHERE wap.id IS NULL AND wab.balance > 0 AND wab.asset_code <> 'USDT'
ON CONFLICT (wallet_id, asset_code) DO NOTHING;

-- Fix: Update the trg_sync_asset_position trigger to keep positions in sync
-- when wallet_asset_balances change (not just on first insert)
CREATE OR REPLACE FUNCTION sync_asset_position_on_balance_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip USDT — positions only track non-USDT assets
  IF NEW.asset_code = 'USDT' THEN
    RETURN NEW;
  END IF;

  -- Upsert: create if not exists, update qty_on_hand if balance changed
  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (NEW.wallet_id, NEW.asset_code, NEW.balance, 0, 0)
  ON CONFLICT (wallet_id, asset_code) DO UPDATE
  SET qty_on_hand = EXCLUDED.qty_on_hand,
      updated_at = now()
  WHERE wallet_asset_positions.qty_on_hand <> EXCLUDED.qty_on_hand;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_sync_asset_position ON wallet_asset_balances;
CREATE TRIGGER trg_sync_asset_position
  AFTER INSERT OR UPDATE OF balance ON wallet_asset_balances
  FOR EACH ROW
  EXECUTE FUNCTION sync_asset_position_on_balance_change();
