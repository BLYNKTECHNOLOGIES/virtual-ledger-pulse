-- Deactivate 14 zombie terminal_order_assignments for already-completed Binance orders
UPDATE terminal_order_assignments
SET is_active = false, updated_at = now()
WHERE is_active = true
AND order_number IN (
  SELECT toa.order_number
  FROM terminal_order_assignments toa
  JOIN p2p_order_records por ON por.binance_order_number = toa.order_number
  WHERE toa.is_active = true
  AND por.order_status IN ('COMPLETED', 'CANCELLED', 'EXPIRED')
);