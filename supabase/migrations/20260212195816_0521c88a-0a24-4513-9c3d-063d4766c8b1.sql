-- Drop the ambiguous 3-parameter overload, keeping only the one with p_asset_code (which has DEFAULT 'USDT')
DROP FUNCTION IF EXISTS public.process_sales_order_wallet_deduction(uuid, uuid, numeric);
