
-- O13: Strengthen conversion approval validation to include approved_at and rejected_by
CREATE OR REPLACE FUNCTION public.validate_conversion_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'approved_by and approved_at are required when status is APPROVED';
  END IF;
  IF NEW.status = 'REJECTED' AND NEW.rejected_by IS NULL THEN
    RAISE EXCEPTION 'rejected_by is required when status is REJECTED';
  END IF;
  RETURN NEW;
END;
$$;

-- O16: Change FK to SET NULL to prevent orphaned approvals
ALTER TABLE public.client_onboarding_approvals
  DROP CONSTRAINT client_onboarding_approvals_sales_order_id_fkey,
  ADD CONSTRAINT client_onboarding_approvals_sales_order_id_fkey
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE SET NULL;
