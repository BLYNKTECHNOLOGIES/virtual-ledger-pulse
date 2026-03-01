create or replace function public.create_manual_purchase_complete_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_bank_account_id uuid,
  p_description text default ''::text,
  p_contact_number text default null::text,
  p_credit_wallet_id uuid default null::uuid,
  p_tds_option text default 'NO_TDS'::text,
  p_pan_number text default null::text,
  p_fee_percentage numeric default null::numeric,
  p_is_off_market boolean default false,
  p_created_by uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Call the intended v2 overload positionally to avoid overload ambiguity
  select public.create_manual_purchase_complete_v2(
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_total_amount,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_bank_account_id,
    p_description,
    p_contact_number,
    p_credit_wallet_id,
    p_tds_option,
    p_pan_number,
    p_fee_percentage,
    p_is_off_market,
    p_created_by
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.create_manual_purchase_with_split_payments_rpc(
  p_order_number text,
  p_supplier_name text,
  p_order_date date,
  p_total_amount numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_description text default ''::text,
  p_contact_number text default null::text,
  p_credit_wallet_id uuid default null::uuid,
  p_tds_option text default 'NO_TDS'::text,
  p_pan_number text default null::text,
  p_fee_percentage numeric default null::numeric,
  p_is_off_market boolean default false,
  p_created_by uuid default null::uuid,
  p_payment_splits jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Call the intended split overload positionally to avoid overload ambiguity
  select public.create_manual_purchase_with_split_payments(
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_total_amount,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_description,
    p_contact_number,
    p_credit_wallet_id,
    p_tds_option,
    p_pan_number,
    p_fee_percentage,
    p_is_off_market,
    p_created_by,
    p_payment_splits
  )
  into v_result;

  return v_result;
end;
$$;