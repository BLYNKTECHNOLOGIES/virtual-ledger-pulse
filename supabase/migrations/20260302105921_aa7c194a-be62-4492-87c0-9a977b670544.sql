-- Drop the duplicate overloaded function (the one with p_contact_number in different position)
-- Keep the one with p_contact_number AFTER p_description (oid order - first one)
-- and drop the second one where p_contact_number is at the end

DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(
  text, text, date, numeric, uuid, numeric, numeric, uuid,
  text, uuid, text, text, numeric, boolean, uuid, text
);

-- Create a clean wrapper that routes to the remaining function
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_bank_account_id uuid,
  p_description text DEFAULT ''::text,
  p_contact_number text DEFAULT NULL::text,
  p_credit_wallet_id uuid DEFAULT NULL::uuid,
  p_tds_option text DEFAULT 'NO_TDS'::text,
  p_pan_number text DEFAULT NULL::text,
  p_fee_percentage numeric DEFAULT NULL::numeric,
  p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.create_manual_purchase_complete_v2(
    p_order_number, p_supplier_name, p_order_date, p_total_amount,
    p_product_id, p_quantity, p_unit_price, p_bank_account_id,
    p_description, p_contact_number, p_credit_wallet_id,
    p_tds_option, p_pan_number, p_fee_percentage,
    p_is_off_market, p_created_by
  );
$$;