
-- Fix the _rpc wrapper: positional args must match the main function's parameter order.
-- Main function order: ..., p_description, p_credit_wallet_id, p_tds_option, p_pan_number, ..., p_contact_number, p_payment_splits
-- Old _rpc wrapper was passing p_contact_number before p_credit_wallet_id (WRONG).

CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_description text DEFAULT '',
  p_contact_number text DEFAULT NULL,
  p_credit_wallet_id uuid DEFAULT NULL,
  p_tds_option text DEFAULT 'NO_TDS',
  p_pan_number text DEFAULT NULL,
  p_fee_percentage numeric DEFAULT NULL,
  p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL,
  p_payment_splits jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_result jsonb;
begin
  -- Call the main function with NAMED parameters to avoid positional mismatches
  select public.create_manual_purchase_with_split_payments(
    p_order_number   := p_order_number,
    p_supplier_name  := p_supplier_name,
    p_order_date     := p_order_date,
    p_total_amount   := p_total_amount,
    p_product_id     := p_product_id,
    p_quantity       := p_quantity,
    p_unit_price     := p_unit_price,
    p_description    := p_description,
    p_credit_wallet_id := p_credit_wallet_id,
    p_tds_option     := p_tds_option,
    p_pan_number     := p_pan_number,
    p_fee_percentage := p_fee_percentage,
    p_is_off_market  := p_is_off_market,
    p_created_by     := p_created_by,
    p_contact_number := p_contact_number,
    p_payment_splits := p_payment_splits
  )
  into v_result;

  return v_result;
end;
$$;
