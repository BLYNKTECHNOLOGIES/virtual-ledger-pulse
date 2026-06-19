-- 1. Extend terminal_exchange_accounts with multi-account metadata
ALTER TABLE public.terminal_exchange_accounts
  ADD COLUMN IF NOT EXISTS credential_key text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- 2. Seed the two accounts with deterministic ids
INSERT INTO public.terminal_exchange_accounts
  (id, account_name, account_identifier, exchange_platform, is_active, credential_key, is_default, color, display_order)
VALUES
  ('00000000-0000-0000-0000-000000000001','Account 1 (Primary)','primary','binance', true, 'default', true, '#F0B90B', 0),
  ('00000000-0000-0000-0000-000000000002','Account 2','secondary','binance', true, 'acct2', false, '#2563EB', 1)
ON CONFLICT (id) DO NOTHING;

-- ensure only one default
UPDATE public.terminal_exchange_accounts SET is_default = false WHERE id <> '00000000-0000-0000-0000-000000000001';

-- 3. Add exchange_account_id discriminator to every account-scoped table,
--    defaulting all existing rows to Account 1, with FK + index.
DO $$
DECLARE
  t text;
  acct1 uuid := '00000000-0000-0000-0000-000000000001';
  tbls text[] := ARRAY[
    'binance_order_history','p2p_order_records','p2p_order_chats','binance_order_chat_messages',
    'wallet_transactions','wallet_asset_balances','wallet_asset_positions',
    'asset_movement_history','asset_movement_sync_metadata','binance_sync_metadata',
    'binance_ad_state_snapshots','binance_merchant_state_snapshots','binance_commission_rate_snapshots',
    'ad_pricing_rules','ad_pricing_engine_state','ad_payment_methods',
    'small_buys_sync','small_sales_sync',
    'terminal_order_assignments','terminal_purchase_sync','terminal_sales_sync',
    'p2p_auto_pay_log','p2p_auto_pay_engine_runs','p2p_auto_pay_settings',
    'p2p_auto_reply_log','p2p_auto_reply_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS exchange_account_id uuid NOT NULL DEFAULT %L',
      t, acct1
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (exchange_account_id)',
      'idx_' || t || '_exch_acct', t
    );
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (exchange_account_id) REFERENCES public.terminal_exchange_accounts(id)',
        t, 'fk_' || t || '_exch_acct'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 4. Grants (idempotent) for the accounts table used by edge functions + app
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_exchange_accounts TO authenticated;
GRANT ALL ON public.terminal_exchange_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_user_exchange_mappings TO authenticated;
GRANT ALL ON public.terminal_user_exchange_mappings TO service_role;