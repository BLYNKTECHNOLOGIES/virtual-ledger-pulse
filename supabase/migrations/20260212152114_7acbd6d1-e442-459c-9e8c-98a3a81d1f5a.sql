-- Drop the OLD overloaded version that has p_contact_number at the END and tds default 'none'
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(
  text, text, date, numeric, uuid, numeric, numeric, uuid, text, uuid, text, text, numeric, boolean, uuid, text
);