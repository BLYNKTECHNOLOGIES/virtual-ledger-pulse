
-- =====================================================
-- FIX 1: DATA CORRECTION
-- Move the 1903 manual adjustment from BINANCE SS to BINANCE BLYNK
-- BINANCE SS (117fc970) has an incorrect DEBIT of 1903
-- It should be on BINANCE BLYNK (6d9114f1)
-- =====================================================

-- Delete the wrong entry from BINANCE SS (trigger will reverse the -1903 balance)
DELETE FROM wallet_transactions
WHERE id = 'b336059f-9109-438b-a08b-0d80f3cbd2ad'
  AND wallet_id = '117fc970-a23c-41cd-8f46-e46d7e0c1118';

-- Insert the correct entry on BINANCE BLYNK
INSERT INTO wallet_transactions (
  wallet_id, transaction_type, amount, reference_type, description, asset_code
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'DEBIT',
  1903,
  'MANUAL_ADJUSTMENT',
  'Variance correction: USDT balance alignment (moved from BINANCE SS)',
  'USDT'
);

-- =====================================================
-- FIX 2: STRUCTURAL BUG - Add UPDATE handling to trigger
-- The update_wallet_balance trigger only fires on INSERT+DELETE (tgtype=13)
-- It completely ignores UPDATE, causing balance desync when wallet_id,
-- amount, or transaction_type is changed on an existing record.
-- =====================================================

CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset TEXT;
  v_wallet_id UUID;
  v_amount NUMERIC;
  v_tx_type TEXT;
BEGIN
  -- ============ INSERT: apply effect ============
  IF TG_OP = 'INSERT' THEN
    v_asset := COALESCE(NEW.asset_code, 'USDT');
    v_wallet_id := NEW.wallet_id;
    v_amount := NEW.amount;
    v_tx_type := NEW.transaction_type;

    IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance + v_amount,
            total_received = total_received + v_amount,
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, v_amount, v_amount, 0)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
        updated_at = now();

    ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance - v_amount,
            total_sent = total_sent + v_amount,
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, -v_amount, 0, v_amount)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
        updated_at = now();
    END IF;

    RETURN NEW;
  END IF;

  -- ============ UPDATE: reverse OLD effect, apply NEW effect ============
  IF TG_OP = 'UPDATE' THEN
    -- Only act if financially-relevant columns changed
    IF OLD.wallet_id IS DISTINCT FROM NEW.wallet_id
       OR OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.transaction_type IS DISTINCT FROM NEW.transaction_type
       OR OLD.asset_code IS DISTINCT FROM NEW.asset_code
    THEN
      -- === REVERSE OLD ===
      v_asset := COALESCE(OLD.asset_code, 'USDT');
      v_wallet_id := OLD.wallet_id;
      v_amount := OLD.amount;
      v_tx_type := OLD.transaction_type;

      IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
        IF v_asset = 'USDT' THEN
          UPDATE wallets
          SET current_balance = current_balance - v_amount,
              total_received = GREATEST(0, total_received - v_amount),
              updated_at = now()
          WHERE id = v_wallet_id;
        END IF;
        UPDATE wallet_asset_balances
        SET balance = balance - v_amount,
            total_received = GREATEST(0, total_received - v_amount),
            updated_at = now()
        WHERE wallet_id = v_wallet_id AND asset_code = v_asset;

      ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
        IF v_asset = 'USDT' THEN
          UPDATE wallets
          SET current_balance = current_balance + v_amount,
              total_sent = GREATEST(0, total_sent - v_amount),
              updated_at = now()
          WHERE id = v_wallet_id;
        END IF;
        UPDATE wallet_asset_balances
        SET balance = balance + v_amount,
            total_sent = GREATEST(0, total_sent - v_amount),
            updated_at = now()
        WHERE wallet_id = v_wallet_id AND asset_code = v_asset;
      END IF;

      -- === APPLY NEW ===
      v_asset := COALESCE(NEW.asset_code, 'USDT');
      v_wallet_id := NEW.wallet_id;
      v_amount := NEW.amount;
      v_tx_type := NEW.transaction_type;

      IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
        IF v_asset = 'USDT' THEN
          UPDATE wallets
          SET current_balance = current_balance + v_amount,
              total_received = total_received + v_amount,
              updated_at = now()
          WHERE id = v_wallet_id;
        END IF;
        INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
        VALUES (v_wallet_id, v_asset, v_amount, v_amount, 0)
        ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
          balance = wallet_asset_balances.balance + EXCLUDED.balance,
          total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
          updated_at = now();

      ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
        IF v_asset = 'USDT' THEN
          UPDATE wallets
          SET current_balance = current_balance - v_amount,
              total_sent = total_sent + v_amount,
              updated_at = now()
          WHERE id = v_wallet_id;
        END IF;
        INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
        VALUES (v_wallet_id, v_asset, -v_amount, 0, v_amount)
        ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
          balance = wallet_asset_balances.balance + EXCLUDED.balance,
          total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
          updated_at = now();
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ============ DELETE: reverse prior effect ============
  IF TG_OP = 'DELETE' THEN
    v_asset := COALESCE(OLD.asset_code, 'USDT');
    v_wallet_id := OLD.wallet_id;
    v_amount := OLD.amount;
    v_tx_type := OLD.transaction_type;

    IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance - v_amount,
            total_received = GREATEST(0, total_received - v_amount),
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, -v_amount, -v_amount, 0)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_received = GREATEST(0, wallet_asset_balances.total_received + EXCLUDED.total_received),
        updated_at = now();

    ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance + v_amount,
            total_sent = GREATEST(0, total_sent - v_amount),
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, v_amount, 0, -v_amount)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_sent = GREATEST(0, wallet_asset_balances.total_sent + EXCLUDED.total_sent),
        updated_at = now();
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate trigger to include INSERT, UPDATE, and DELETE
DROP TRIGGER IF EXISTS update_wallet_balance_trigger ON wallet_transactions;
CREATE TRIGGER update_wallet_balance_trigger
  AFTER INSERT OR UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_balance();
