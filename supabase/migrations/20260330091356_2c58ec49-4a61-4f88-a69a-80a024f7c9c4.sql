-- Fix btrim(uuid) error: cast reviewed_by to text before trimming
CREATE OR REPLACE FUNCTION public.enforce_sales_sync_review_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sync_status IN ('approved', 'rejected') THEN
    IF NEW.reviewed_by IS NULL OR btrim(NEW.reviewed_by::text) = '' THEN
      RAISE EXCEPTION 'reviewed_by is required when % is %', TG_TABLE_NAME, NEW.sync_status;
    END IF;

    IF NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;