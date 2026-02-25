

# Advanced Automated Ad Pricing Engine (Final Plan)

## Overview

A server-side automation engine that monitors competitor Binance P2P merchants and auto-adjusts your ad prices every 2 minutes. Supports fixed and floating price types, all P2P coins, anti-exploitation safeguards, and per-ad exclusion from automation.

## Data Source: Confirmed Working

The public Binance P2P search API at `https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search` is confirmed live and functional. It requires a POST body with asset/fiat/tradeType parameters and returns merchant listings including nicknames, prices, and payment methods. No authentication or web scraping needed. Called server-side from our edge function, so no CORS issues.

---

## Terminology

```text
Binance "SELL" page = Our Terminal "BUY" ads (we purchase from customers)
Binance "BUY" page  = Our Terminal "SELL" ads (we sell to customers)
```

---

## Pricing Offset Design

Both BUY and SELL ads support BOTH undercut and overcut. The operator chooses the direction per rule:

```text
BUY Ads:
  - Overcut  = offer MORE than competitor -> price goes UP (attract sellers)
  - Undercut = offer LESS than competitor -> price goes DOWN (save margin)

SELL Ads:
  - Overcut  = offer MORE than competitor -> price goes UP (maintain margin)
  - Undercut = offer LESS than competitor -> price goes DOWN (attract buyers)

Each rule has: offset_direction (OVERCUT or UNDERCUT) + offset_amount (fixed) or offset_pct (floating)
```

---

## Floating Price Calculation for Non-USDT Coins

```text
Example (BUY ad for BTC, floating mode):
  Competitor price:       88,50,000 INR
  BTC/USDT live:          97,000
  USDT/INR live:          90.9
  Reference INR price:    97,000 x 90.9 = 88,17,300
  Base ratio:             (88,50,000 / 88,17,300) x 100 = 100.37%
  Overcut +0.05%:         100.42%
  Clamp to ceiling/floor: OK
  Result:                 Set floating ratio to 100.42%
```

---

## Anti-Exploitation and Safety Systems

**1. Market Rate Anchor Validation**
- `max_deviation_from_market_pct`: Skip update if competitor's price deviates more than X% from the coin's USDT-derived fair market value. Protects against adversaries posting extreme prices.

**2. Rate-of-Change Guard**
- `max_price_change_per_cycle`: Max INR the price can move per 2-minute cycle.
- `max_ratio_change_per_cycle`: Max % the floating ratio can change per cycle.
- If exceeded, applies the maximum allowed step and logs `rate_limited`.

**3. Consecutive Deviation Auto-Pause**
- `auto_pause_after_deviations`: If competitor triggers the deviation guard N times in a row, the rule auto-pauses for manual review.

**4. Manual Override Cooldown**
- `manual_override_cooldown_minutes`: Pause automation for N minutes after a manual price edit, so the engine doesn't immediately overwrite deliberate changes.

**5. Time-Based Scheduling**
- `active_hours_start` / `active_hours_end`: Only run during configured hours (e.g., 08:00-23:00 IST).
- `resting_price` / `resting_ratio`: Optional safe values to set outside active hours.

---

## Database Schema

### Table: `ad_pricing_rules`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Default gen_random_uuid() |
| name | text | Rule display name |
| is_active | boolean | Default true |
| asset | text | USDT, BTC, USDC, FDUSD, BNB, ETH, TRX, SHIB, XRP, SOL, TON |
| fiat | text | Default 'INR' |
| trade_type | text | BUY or SELL (terminal perspective) |
| price_type | text | FIXED or FLOATING |
| target_merchant | text | Primary merchant nickname |
| fallback_merchants | text[] | Up to 3 fallbacks |
| ad_numbers | text[] | Array of advNo values this rule applies to |
| offset_direction | text | OVERCUT or UNDERCUT |
| offset_amount | numeric | INR offset (for fixed mode) |
| offset_pct | numeric | % offset (for floating mode) |
| max_ceiling | numeric | Max fixed price (INR) |
| min_floor | numeric | Min fixed price (INR) |
| max_ratio_ceiling | numeric | Max floating ratio % |
| min_ratio_floor | numeric | Min floating ratio % |
| max_deviation_from_market_pct | numeric | Default 5 |
| max_price_change_per_cycle | numeric | Nullable = unlimited |
| max_ratio_change_per_cycle | numeric | Nullable = unlimited |
| auto_pause_after_deviations | int | Default 5 |
| manual_override_cooldown_minutes | int | Default 0 = disabled |
| only_counter_when_online | boolean | Default false |
| pause_if_no_merchant_found | boolean | Default false |
| active_hours_start | time | Nullable = 24/7 |
| active_hours_end | time | Nullable |
| resting_price | numeric | Nullable |
| resting_ratio | numeric | Nullable |
| check_interval_seconds | int | Default 120 |
| last_checked_at | timestamptz | |
| last_competitor_price | numeric | |
| last_applied_price | numeric | |
| last_applied_ratio | numeric | |
| last_matched_merchant | text | |
| last_error | text | |
| consecutive_errors | int | Default 0 |
| consecutive_deviations | int | Default 0 |
| last_manual_edit_at | timestamptz | |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### Table: `ad_pricing_logs`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| rule_id | uuid FK | |
| ad_number | text | |
| competitor_merchant | text | |
| competitor_price | numeric | |
| market_reference_price | numeric | |
| deviation_from_market_pct | numeric | |
| calculated_price | numeric | |
| calculated_ratio | numeric | |
| applied_price | numeric | |
| applied_ratio | numeric | |
| was_capped | boolean | |
| was_rate_limited | boolean | |
| skipped_reason | text | deviation_exceeded, no_merchant, no_change, outside_hours, cooldown, auto_paused |
| status | text | success / error / skipped / no_change |
| error_message | text | |
| created_at | timestamptz | |

### Table: `ad_automation_exclusions`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| adv_no | text UNIQUE | |
| excluded_at | timestamptz | Default now() |
| reason | text | Nullable |

---

## Edge Function: `auto-price-engine`

### Execution Flow Per Rule

```text
1. CHECK SCHEDULING
   - Is current time within active_hours? If not -> set resting price if configured, skip otherwise

2. CHECK COOLDOWN
   - Was last_manual_edit_at within manual_override_cooldown_minutes? If yes -> skip 'cooldown'

3. CHECK AUTO-PAUSE
   - Is consecutive_deviations >= auto_pause_after_deviations? -> set is_active=false, skip 'auto_paused'

4. FETCH COMPETITOR DATA
   - Map trade_type: terminal BUY -> Binance "SELL", terminal SELL -> Binance "BUY"
   - POST to https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
     Body: { asset, fiat, tradeType, page: 1, rows: 20 }
   - Find target_merchant by advertiser.nickName
   - If not found, try fallback_merchants in order
   - If none found and pause_if_no_merchant_found -> skip 'no_merchant'

5. MARKET VALIDATION (non-USDT assets)
   - Fetch coin/USDT rate via Binance ticker (e.g. BTCUSDT)
   - Fetch USDT/INR via fetch-usdt-rate edge function
   - reference_inr = coin_usdt * usdt_inr
   - deviation = abs((competitor_price - reference_inr) / reference_inr) * 100
   - If deviation > max_deviation_from_market_pct:
     increment consecutive_deviations, skip 'deviation_exceeded'
   - Else: reset consecutive_deviations to 0

6. CALCULATE PRICE
   FIXED mode:
     OVERCUT:  new_price = competitor_price + offset_amount
     UNDERCUT: new_price = competitor_price - offset_amount

   FLOATING mode:
     reference_inr = coin_usdt * usdt_inr (or usdt_inr for USDT)
     base_ratio = (competitor_price / reference_inr) * 100
     OVERCUT:  new_ratio = base_ratio + offset_pct
     UNDERCUT: new_ratio = base_ratio - offset_pct

7. RATE-OF-CHANGE GUARD
   - If max_price_change_per_cycle set and |new_price - last_applied_price| exceeds it:
     clamp to max step, log was_rate_limited = true
   - Same for ratio with max_ratio_change_per_cycle

8. HARD LIMITS
   - Clamp fixed price to [min_floor, max_ceiling]
   - Clamp floating ratio to [min_ratio_floor, max_ratio_ceiling]

9. EXECUTE
   - Filter out ads in ad_automation_exclusions
   - For each ad_number: skip if price/ratio unchanged
   - Call binance-ads edge function with updateAd action
   - 300ms delay between API calls
   - Log to ad_pricing_logs
   - Update rule state fields
```

### New Action in `binance-ads`: `searchP2PMerchant`

Calls the public Binance P2P search API so the frontend can preview merchant listings when creating rules. No proxy auth needed -- direct call to public endpoint.

---

## Frontend Components

### "Auto Pricing" Tab in `TerminalAutomation.tsx`

New tab with Crosshair icon alongside existing automation tabs.

### `AutoPricingRules.tsx` -- Rule Dashboard

- Rule cards showing: active toggle, name, asset/trade/price badges, target merchant, ad count, last competitor price, last applied price/ratio, health indicator (green/yellow/red based on consecutive_errors), last checked time
- Edit / Delete / Manual Trigger buttons per rule
- "Add Rule" button at top
- Summary bar: total rules, active count, paused count

### `AutoPricingRuleDialog.tsx` -- Rule Configuration Form

Accordion-based multi-section form:

**Section 1: Basic Settings**
- Rule name, Asset dropdown (11 coins), Fiat, Trade Type (BUY/SELL with Binance mapping helper text), Price Type (Fixed/Floating)

**Section 2: Target Merchants**
- Primary merchant nickname input + "Search Preview" button (calls searchP2PMerchant, shows name/price/completion rate)
- Up to 3 fallback merchant inputs with individual previews
- Toggle: Only counter when merchant is online
- Toggle: Pause rule if no merchant found

**Section 3: Ad Selection (by category)**
- Grouped checkboxes matching existing categorization: Small Buy (Fixed/Floating), Small Sale (Fixed/Floating), Big Buy (Fixed/Floating), Big Sale (Fixed/Floating)
- Only shows ads matching selected asset + trade type
- Excluded ads greyed out with "Excluded from automation" label
- Category-level "Select All" checkboxes

**Section 4: Pricing Offset**
- Direction selector: Overcut / Undercut (available for ALL trade types)
- Helper text: "Overcut = price goes UP from competitor, Undercut = price goes DOWN"
- Amount input (for fixed mode) or Percentage input (for floating mode)

**Section 5: Safety Limits**
- Max ceiling / Min floor (INR, for fixed mode)
- Max ratio ceiling / Min ratio floor (%, for floating mode)

**Section 6: Anti-Exploitation (collapsible)**
- Max deviation from market rate (%, default 5)
- Max price change per cycle (INR, optional)
- Max ratio change per cycle (%, optional)
- Auto-pause after N consecutive deviations (default 5)
- Manual override cooldown (minutes, default 0)

**Section 7: Scheduling (collapsible)**
- Active hours: start/end time pickers (empty = 24/7)
- Resting price (INR) / Resting ratio (%) -- values to set outside active hours
- Check interval (seconds, default 120)

### `AutoPricingLogs.tsx` -- Audit Trail

- Filterable table: time, rule, ad, merchant, competitor price, market ref, deviation%, applied price/ratio, status, guards triggered
- Color-coded status badges
- Filter by rule, status, date range

### Ad Manager Exclusion in `CategorizedAdTable.tsx`

- ShieldBan icon button in the Actions column of each ad row
- Not excluded: subtle grey icon, click to exclude
- Excluded: highlighted orange/red icon with tooltip "Excluded from automation"

---

## Hooks

### `useAutoPricingRules.ts`
- `useAutoPricingRules()`: Fetch all rules
- `useCreateAutoPricingRule()`: Insert rule
- `useUpdateAutoPricingRule()`: Update rule
- `useDeleteAutoPricingRule()`: Delete rule
- `useAutoPricingLogs(ruleId?)`: Fetch logs with optional filter
- `useSearchMerchant(asset, fiat, tradeType, nickname)`: Calls binance-ads searchP2PMerchant action
- `useManualTriggerRule(ruleId)`: Calls edge function for immediate test
- `useResetRuleState(ruleId)`: Resets consecutive_deviations/errors, re-enables paused rule

### `useAdAutomationExclusion.ts`
- `useExcludedAds()`: Fetch all excluded advNo values
- `useToggleAdExclusion(advNo)`: Insert or delete from exclusions table

---

## Cron Job (pg_cron + pg_net)

SQL insert to schedule the engine every 2 minutes:
```sql
SELECT cron.schedule(
  'auto-price-engine',
  '*/2 * * * *',
  $$ SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/auto-price-engine',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

---

## Config Update

Add to `supabase/config.toml`:
```toml
[functions.auto-price-engine]
verify_jwt = false
```

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/..._auto_pricing_tables.sql` | Create 3 tables (rules, logs, exclusions) |
| `supabase/functions/auto-price-engine/index.ts` | New edge function with full pricing logic |
| `supabase/functions/binance-ads/index.ts` | Add `searchP2PMerchant` action |
| `supabase/config.toml` | Add `[functions.auto-price-engine]` entry |
| `src/hooks/useAutoPricingRules.ts` | New hook for CRUD + merchant search + trigger |
| `src/hooks/useAdAutomationExclusion.ts` | New hook for per-ad exclusion |
| `src/components/terminal/automation/AutoPricingRules.tsx` | Rules dashboard component |
| `src/components/terminal/automation/AutoPricingRuleDialog.tsx` | Multi-section rule form |
| `src/components/terminal/automation/AutoPricingLogs.tsx` | Logs viewer component |
| `src/pages/terminal/TerminalAutomation.tsx` | Add "Auto Pricing" tab |
| `src/components/ad-manager/CategorizedAdTable.tsx` | Add per-ad exclusion toggle |
| SQL insert for pg_cron | Schedule engine every 2 minutes |

