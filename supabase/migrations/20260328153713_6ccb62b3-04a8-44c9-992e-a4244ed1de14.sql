
-- #7 FIX: Rewrite PO status history trigger to actually insert into purchase_order_status_history
CREATE OR REPLACE FUNCTION public.track_purchase_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO purchase_order_status_history (order_id, old_status, new_status, changed_by, changed_at)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), now());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- #4 FIX: Set search_path on check_wallet_balance_before_transaction
ALTER FUNCTION public.check_wallet_balance_before_transaction() SET search_path = public;
