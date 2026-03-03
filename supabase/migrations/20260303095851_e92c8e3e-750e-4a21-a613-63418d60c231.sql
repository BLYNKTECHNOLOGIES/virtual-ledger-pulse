
-- Fix create_manual_purchase_complete_rpc to use named params (preventive)
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_bank_account_id uuid,
  p_description text DEFAULT '',
  p_contact_number text DEFAULT NULL,
  p_credit_wallet_id uuid DEFAULT NULL,
  p_tds_option text DEFAULT 'NO_TDS',
  p_pan_number text DEFAULT NULL,
  p_fee_percentage numeric DEFAULT NULL,
  p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_result jsonb;
begin
  select public.create_manual_purchase_complete_v2(
    p_order_number     := p_order_number,
    p_supplier_name    := p_supplier_name,
    p_order_date       := p_order_date,
    p_total_amount     := p_total_amount,
    p_product_id       := p_product_id,
    p_quantity         := p_quantity,
    p_unit_price       := p_unit_price,
    p_bank_account_id  := p_bank_account_id,
    p_description      := p_description,
    p_contact_number   := p_contact_number,
    p_credit_wallet_id := p_credit_wallet_id,
    p_tds_option       := p_tds_option,
    p_pan_number       := p_pan_number,
    p_fee_percentage   := p_fee_percentage,
    p_is_off_market    := p_is_off_market,
    p_created_by       := p_created_by
  )
  into v_result;
  return v_result;
end;
$$;

-- Fix create_manual_purchase_complete_v2_rpc to use named params (preventive)
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
  p_contact_number text DEFAULT NULL,
  p_credit_wallet_id uuid DEFAULT NULL,
  p_tds_option text DEFAULT 'NO_TDS',
  p_pan_number text DEFAULT NULL,
  p_fee_percentage numeric DEFAULT NULL,
  p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_result jsonb;
begin
  select public.create_manual_purchase_complete_v2(
    p_order_number     := p_order_number,
    p_supplier_name    := p_supplier_name,
    p_order_date       := p_order_date,
    p_total_amount     := p_total_amount,
    p_product_id       := p_product_id,
    p_quantity         := p_quantity,
    p_unit_price       := p_unit_price,
    p_bank_account_id  := p_bank_account_id,
    p_description      := p_description,
    p_contact_number   := p_contact_number,
    p_credit_wallet_id := p_credit_wallet_id,
    p_tds_option       := p_tds_option,
    p_pan_number       := p_pan_number,
    p_fee_percentage   := p_fee_percentage,
    p_is_off_market    := p_is_off_market,
    p_created_by       := p_created_by
  )
  into v_result;
  return v_result;
end;
$$;
