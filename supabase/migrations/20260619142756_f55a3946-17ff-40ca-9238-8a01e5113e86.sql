-- Part 1: Per-account wallet segregation schema

-- 1. Add exchange_account_id to terminal_wallet_links (canonical account->wallet map)
ALTER TABLE public.terminal_wallet_links
  ADD COLUMN IF NOT EXISTS exchange_account_id uuid
  REFERENCES public.terminal_exchange_accounts(id);

-- 2. Add exchange_account_id to erp_action_queue so queued movements keep their account
ALTER TABLE public.erp_action_queue
  ADD COLUMN IF NOT EXISTS exchange_account_id uuid
  REFERENCES public.terminal_exchange_accounts(id);

-- 3. Map the existing active link (BINANCE BLYNK wallet) to the Blynk account
UPDATE public.terminal_wallet_links
SET exchange_account_id = '00000000-0000-0000-0000-000000000002'
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND exchange_account_id IS NULL;

-- 4. Create the ASEC account -> BINANCE ASEC wallet link if it does not exist
INSERT INTO public.terminal_wallet_links (wallet_id, platform_source, api_identifier, status, exchange_account_id, supported_assets, fee_treatment)
SELECT '06830c8f-eb31-48f9-81d1-b12d6234f571', 'terminal', 'binance_p2p', 'active',
       '00000000-0000-0000-0000-000000000001',
       (SELECT supported_assets FROM public.terminal_wallet_links WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' LIMIT 1),
       (SELECT fee_treatment FROM public.terminal_wallet_links WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.terminal_wallet_links
  WHERE exchange_account_id = '00000000-0000-0000-0000-000000000001'
    AND platform_source = 'terminal'
    AND status = 'active'
);

-- Helpful index for account-scoped lookups
CREATE INDEX IF NOT EXISTS idx_terminal_wallet_links_account
  ON public.terminal_wallet_links (exchange_account_id, platform_source, status);
CREATE INDEX IF NOT EXISTS idx_erp_action_queue_account
  ON public.erp_action_queue (exchange_account_id);