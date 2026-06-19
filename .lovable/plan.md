# Adding a Second Binance ID to ERP + Terminal

Goal: run two Binance accounts fully in parallel across Assets/Wallet, P2P Ads/Orders/Terminal, and the automation engines, with both a global admin account-switcher and per-operator account binding. All existing data is tagged to the original ID ("Account 1").

## Phase 0 — AWS / Binance key (do this first, no code)

Recommendation: **reuse your existing AWS proxy.** Your proxy is a stateless signing relay — each request already carries `x-api-key` / `x-api-secret` headers, so it is account-agnostic. Binance allows multiple API keys whitelisted to the same static IP.

Steps you perform on AWS/Binance:
1. On the **new** Binance merchant account, create an API key (Enable Reading + C2C/P2P + Spot as your current key has).
2. Whitelist the **same AWS elastic/static IP** your proxy uses on that new key.
3. Confirm the existing `BINANCE_PROXY_URL` and `BINANCE_PROXY_TOKEN` stay unchanged — both accounts share the one proxy.

No proxy redeploy or second EC2 instance is needed. (A second proxy is only worth it later if you want IP/risk isolation — we keep the design open to that via per-account secret keys.)

## Phase 1 — Credential storage (Supabase secrets, not DB)

Per the security rules we never store API keys in tables. We key secrets by account suffix:
- Account 1 (existing): `BINANCE_API_KEY`, `BINANCE_API_SECRET` (unchanged).
- Account 2 (new): `BINANCE_API_KEY_2`, `BINANCE_API_SECRET_2` (added via the secret tool).
- Shared: `BINANCE_PROXY_URL`, `BINANCE_PROXY_TOKEN`.

The `terminal_exchange_accounts` row carries a `credential_key` text (e.g. `default`, `acct2`) that maps to the secret suffix. Edge functions resolve the suffix → `Deno.env.get`. This keeps adding a 3rd account later to "insert a row + add two secrets".

## Phase 2 — Database (migration)

1. Extend `terminal_exchange_accounts`: add `credential_key text`, `is_default boolean`, `color text` (UI tag), `display_order int`. Seed two rows — Account 1 (`credential_key='default'`, `is_default=true`) and Account 2 (`credential_key='acct2'`). Add GRANTs.
2. Add `exchange_account_id uuid` (FK → `terminal_exchange_accounts`) to every synced/account-scoped table, the full list verified before migration. Core set:
   `binance_order_history`, `p2p_order_records`, `p2p_order_chats`, `binance_order_chat_messages`, `wallet_transactions`, `wallet_asset_balances`, `wallet_asset_positions`, `asset_movement_history`, `asset_movement_sync_metadata`, `binance_sync_metadata`, `binance_ad_state_snapshots`, `binance_merchant_state_snapshots`, `binance_commission_rate_snapshots`, `ad_pricing_rules`, `ad_pricing_engine_state`, `ad_payment_methods`, `small_buys_sync`, `small_sales_sync`, `terminal_order_assignments`, `terminal_purchase_sync`, `terminal_sales_sync`, plus the auto-pay/auto-reply log + state tables.
3. **Backfill**: set `exchange_account_id` = Account 1 on every existing row (done with the insert tool, not migration, since it's data). Then set the column `NOT NULL DEFAULT <Account 1 id>` so legacy/un-migrated code keeps working.
4. `terminal_user_exchange_mappings` already exists — used for per-operator binding (Phase 5).
5. Unique constraints that currently key on order/ad numbers get `exchange_account_id` added so the same order number can't collide across accounts.

## Phase 3 — Shared credential resolver

Add `supabase/functions/_shared/binance-account.ts`:
- `resolveAccount(req | accountId)` → looks up `terminal_exchange_accounts`, returns `{ id, credentialKey, proxyUrl, proxyToken, apiKey, apiSecret }` by reading the suffixed secrets.
- Defaults to Account 1 when no account is passed (backward compatible).

## Phase 4 — Edge function refactor (account-aware)

Each Binance function accepts an `exchange_account_id` (body param / query) and uses the resolver instead of reading globals directly:
- `verify-binance-keys` — verify a specific account; UI "Test connection" per account.
- `binance-assets`, `binance-ads`, `enrich-order-names`, `payer-auto-screenshot` — scope reads/writes and stamp `exchange_account_id` on every inserted row.
- `auto-price-engine`, `auto-pay-engine`, `auto-reply-engine` — loop over **all active accounts** (or run per-account) so automation runs independently per ID. Engine state/logs are keyed per account so one account's circuit-breaker/cooldown never affects the other.
Cron jobs stay; engines iterate active accounts internally.

## Phase 5 — UI

1. **Admin global switcher**: an account selector in the top bar (React context + persisted preference). Scopes ERP views (assets, orders, ads, reports) to the selected ID, with an "All accounts" combined/aggregated view where it makes sense. All Binance `functions.invoke` calls pass the active `exchange_account_id`.
2. **Per-operator binding (terminal)**: operators are mapped to one account via `terminal_user_exchange_mappings`; the terminal auto-filters orders/assignments to their bound account. Admins can manage these mappings and override with the global switcher.
3. **Account badges**: every order/ad/asset row shows a colored account tag so the two IDs are visually distinct in shared lists.
4. **Settings → Exchange Accounts** screen: list accounts, per-account connection test, active toggle, color/label edit.

## Phase 6 — Verification

- Per-account `verify-binance-keys` returns success for both IDs through the proxy.
- Sync one cycle on Account 2; confirm new rows carry Account 2's `exchange_account_id` and existing rows remain Account 1.
- Confirm automation engines run independently (separate state/logs) and an operator bound to Account 2 only sees Account 2 data.

## Rollout order
Phase 0 (you, on AWS) → confirm new key works through proxy → Phase 1/2 → 3/4 → 5 → 6. Phases 2–4 are backward compatible (default = Account 1) so the live single-account flow keeps working throughout.

## Open items I'll confirm during build
- Exact final table list for the discriminator (verified against the live schema before writing the migration).
- Whether "All accounts" aggregation applies to financial/P&L reporting or only operational lists.

## Technical notes
- Credentials never enter the DB; only a `credential_key` suffix that maps to Supabase secrets does.
- `NOT NULL DEFAULT Account 1` on `exchange_account_id` guarantees no orphaned/untagged rows and zero downtime for legacy code paths.
- Adding a future 3rd account = insert one `terminal_exchange_accounts` row + add `BINANCE_API_KEY_3/_SECRET_3` secrets; no code change.
