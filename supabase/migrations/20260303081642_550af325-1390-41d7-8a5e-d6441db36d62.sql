-- Drop the older overload of create_manual_purchase_with_split_payments 
-- that has different parameter order (no p_bank_account_id, different defaults)
-- Keep the one with: p_contact_number before p_payment_splits
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments(
  text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb
);