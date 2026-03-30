-- Drop the OLD 16-param overload (without p_deduction_bank_account_id)
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(
  p_order_number text, p_supplier_name text, p_order_date date, p_total_amount numeric,
  p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_bank_account_id uuid,
  p_description text, p_contact_number text, p_credit_wallet_id uuid, p_tds_option text,
  p_pan_number text, p_fee_percentage numeric, p_is_off_market boolean, p_created_by uuid
);

-- Recreate the _rpc wrapper to route to the NEW 17-param version using named args
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_bank_account_id uuid,
  p_description text DEFAULT '',
  p_contact_number text DEFAULT '',
  p_credit_wallet_id uuid DEFAULT NULL,
  p_tds_option text DEFAULT 'none',
  p_pan_number text DEFAULT '',
  p_fee_percentage numeric DEFAULT 0,
  p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.create_manual_purchase_complete_v2(
    p_order_number := p_order_number,
    p_supplier_name := p_supplier_name,
    p_order_date := p_order_date,
    p_total_amount := p_total_amount,
    p_product_id := p_product_id,
    p_quantity := p_quantity,
    p_unit_price := p_unit_price,
    p_description := p_description,
    p_contact_number := p_contact_number,
    p_bank_account_id := p_bank_account_id,
    p_deduction_bank_account_id := NULL,
    p_credit_wallet_id := p_credit_wallet_id,
    p_tds_option := p_tds_option,
    p_pan_number := p_pan_number,
    p_fee_percentage := p_fee_percentage,
    p_is_off_market := p_is_off_market,
    p_created_by := p_created_by
  ) INTO v_result;

  RETURN v_result;
END;
$$;