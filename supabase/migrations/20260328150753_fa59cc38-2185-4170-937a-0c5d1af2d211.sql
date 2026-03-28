
-- C1: Prevent invalid leave date ranges
-- Using validation trigger instead of CHECK (per Supabase guidelines for date validations)
CREATE OR REPLACE FUNCTION public.validate_leave_request_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end_date (%) cannot be before start_date (%)', NEW.end_date, NEW.start_date;
  END IF;
  IF NEW.total_days IS NOT NULL AND NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'Leave total_days must be greater than 0, got %', NEW.total_days;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_leave_dates
  BEFORE INSERT OR UPDATE ON hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_leave_request_dates();

-- C2: Prevent zero-amount wallet transactions
CREATE OR REPLACE FUNCTION public.validate_wallet_transaction_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount = 0 THEN
    RAISE EXCEPTION 'Wallet transaction amount cannot be zero';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_wallet_tx_amount
  BEFORE INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_wallet_transaction_amount();

-- C3: Unique constraint on reference_no (partial, non-null only)
CREATE UNIQUE INDEX erp_product_conversions_reference_no_unique 
  ON erp_product_conversions (reference_no) 
  WHERE reference_no IS NOT NULL;
