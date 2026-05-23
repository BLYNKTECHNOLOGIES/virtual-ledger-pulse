UPDATE public.wallet_asset_balances
SET balance = 0,
    updated_at = now();

UPDATE public.bank_accounts
SET balance = 0,
    updated_at = now();

UPDATE public.products
SET current_stock_quantity = 0,
    updated_at = now();