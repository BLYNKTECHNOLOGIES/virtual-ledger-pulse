

# Auto-Pricing Audit — Implementation Plan

## My Analysis vs Audit Claims

### SECTION 1: CONFIRMED BUGS

| # | Audit Claim | My Verification | Verdict |
|---|---|---|---|
| **AP-BUG-01** | Rest timer not checked — 36 failed API calls | **TRUE.** Edge function has zero reference to `ad_rest_timer`. DB confirms 36/43 errors are "taking a break." | Fix in edge function |
| **AP-BUG-02** | target_merchant has leading space | **TRUE.** DB shows `" HAAMISAFE"` (BTC rule). Edge function trims at runtime (line 194) so it works, but data is dirty. | Data fix + trim trigger |
| **AP-BUG-03** | Duplicate fields (top-level vs asset_config) | **ALREADY HANDLED.** Edge function line 271 already does `config.offset_pct ?? rule.offset_pct ?? 0`. Audit missed this. Only needs column comments for clarity. | Column comments only |
| **AP-BUG-04** | auto_pause_after_deviations too high (5000/550) | **TRUE.** DB confirmed. 5000 at 2-min intervals = ~7 days. Will use validation trigger (not CHECK constraint per Supabase rules). | Data fix + validation trigger |
| **AP-BUG-05** | No ad number conflict detection | **VALID but low risk.** No overlaps exist today. Will add edge function check. | Edge function guard |

### SECTION 2: MISSING FUNCTIONALITY

| # | Audit Claim | My Verification | Verdict |
|---|---|---|---|
| **AP-MISS-01** | No SELL side rules | **CONFIG TASK, not code.** Schema supports SELL, edge function handles UNDERCUT correctly (line 289-291). Just needs rules created via admin UI. | No code change needed |
| **AP-MISS-02** | No health dashboard RPC | **TRUE.** No `get_ad_pricing_health` function exists. | Create RPC |
| **AP-MISS-03** | No anomaly alerts | **TRUE.** No notification on price spikes, merchant disappearance, or auto-pause events. | Add to edge function |
| **AP-MISS-04** | No DB-level cooldown enforcement | **PARTIALLY REDUNDANT.** Edge function already enforces (lines 99-104). DB trigger adds defense-in-depth. | Add trigger |
| **AP-MISS-05** | No log retention | **TRUE.** 691 logs, projecting ~130K/month. No cleanup. | Add to cleanup cron |
| **AP-MISS-06** | No resting price implementation | **ALREADY IMPLEMENTED.** Edge function lines 90-95 call `applyRestingPriceMultiAsset()`. Audit was wrong. | Skip |
| **AP-MISS-07** | No price effectiveness tracking | **TRUE.** No correlation between pricing changes and order outcomes. | New table + snapshot function |
| **AP-MISS-08** | Rest timer is global | **BY DESIGN.** Single Binance account = single rest state. Not needed unless multi-account planned. | Skip |

### SECTION 3: ARCHITECTURAL IMPROVEMENTS

| # | Audit Claim | My Verification | Verdict |
|---|---|---|---|
| **AP-ARCH-01** | No circuit breaker | **TRUE.** Engine retries indefinitely on Binance API failure. | New singleton table + edge function logic |
| **AP-ARCH-02** | No DB-level price rate limiter | **REDUNDANT.** Edge function already enforces `max_price_change_per_cycle` (lines 294-300) and `max_ratio_change_per_cycle` (lines 322-328). DB function adds nothing since edge function is the only writer. | Skip |
| **AP-ARCH-03** | No dry-run mode | **TRUE and USEFUL.** No way to test rules without hitting Binance. | Add column + edge function conditional |

---

## Implementation Plan

### Phase 0 — Critical Fixes (3 items)

**1. AP-BUG-01: Rest timer check in edge function**
- At top of `auto-price-engine/index.ts`, before processing rules, query `ad_rest_timer WHERE is_active = true`
- If active and not expired: skip entire cycle, log with `status='skipped', skipped_reason='rest_timer'`
- If expired but not deactivated: clean it up automatically

**2. AP-BUG-02: Trim merchant data + trigger**
- Migration: `UPDATE ad_pricing_rules SET target_merchant = TRIM(target_merchant)`
- Create `trim_ad_pricing_rule_merchants()` trigger to auto-trim on INSERT/UPDATE

**3. AP-BUG-04: Lower auto_pause + validation trigger**
- Migration: `UPDATE ad_pricing_rules SET auto_pause_after_deviations = 15 WHERE auto_pause_after_deviations > 100`
- Create validation trigger (not CHECK constraint) enforcing range 1-100

### Phase 1 — Safety & Reliability (5 items)

**4. AP-BUG-05: Ad conflict detection in edge function**
- Before processing rules, build map of ad_number → rule_name across active rules
- Log conflicts with `status='skipped', skipped_reason='conflict'`

**5. AP-MISS-03: Anomaly alerts in edge function**
- After price calculation, detect >3% change from `last_applied_price`
- Insert notification to `terminal_notifications` with `notification_type='pricing_anomaly'`
- Rate-limit: max 1 alert per rule per 15 minutes (check last notification timestamp)
- Also alert on: merchant disappearance, consecutive errors >=5, auto-pause events

**6. AP-ARCH-01: Circuit breaker**
- Migration: Create `ad_pricing_engine_state` singleton table (circuit_status, consecutive_failures, failure_threshold=5, cooldown_minutes=10)
- Edge function: check state at start, skip if circuit is OPEN and cooldown hasn't elapsed. On HALF_OPEN, process only first rule as test. Track successes/failures to transition states.

**7. AP-MISS-04: Cooldown enforcement trigger**
- Create `enforce_pricing_cooldown()` BEFORE UPDATE trigger on `ad_pricing_rules`
- Blocks `last_applied_price`/`last_applied_ratio` updates during manual cooldown window

**8. AP-BUG-03: Field hierarchy comments**
- Add `COMMENT ON COLUMN` for offset/cap fields clarifying the fallback chain

### Phase 2 — Operational Completeness (3 items)

**9. AP-MISS-02: Health dashboard RPC**
- Create `get_ad_pricing_health()` SECURITY DEFINER function returning JSONB with active/total rules, rest timer status, last success/error timestamps, hourly counts, per-rule detail

**10. AP-MISS-05: Log retention**
- Add to existing `cleanup_terminal_stale_data()`: delete `ad_pricing_logs` older than 30 days, `ad_action_logs` older than 90 days

**11. AP-MISS-01: SELL rule support verification**
- No code changes. Verified edge function already handles `trade_type='SELL'` + `offset_direction='UNDERCUT'` correctly. This is a configuration task for the admin.

### Phase 3 — Analytics & Polish (2 items, inside auto-pricing sub)

**12. AP-MISS-07: Price effectiveness tracking**
- Migration: Create `ad_pricing_effectiveness_snapshots` table (rule_id, ad_number, snapshot_date, total_price_updates, avg_applied_price, avg_competitor_price, avg_spread, orders_received, orders_completed, total_volume)
- Create `generate_pricing_effectiveness_snapshot(p_date)` function that joins pricing logs with `p2p_order_records`
- Add inline summary cards in the AutoPricingRules component showing effectiveness metrics

**13. AP-ARCH-03: Dry-run mode**
- Migration: Add `is_dry_run boolean NOT NULL DEFAULT false` to `ad_pricing_rules`
- Edge function: if `is_dry_run = true`, calculate price, log with `status='dry_run'`, but skip Binance API call
- UI: Add dry-run toggle in AutoPricingRuleDialog

### Skipped Items (with reasoning)

| Item | Reason |
|---|---|
| AP-MISS-06 (Resting price) | Already implemented in edge function |
| AP-MISS-08 (Per-account rest) | Single account, not needed |
| AP-ARCH-02 (DB rate limiter) | Redundant with edge function enforcement |

---

## Files Changed

| File | Action |
|---|---|
| `supabase/migrations/xxx.sql` | Single migration: trim trigger, validation trigger, cooldown trigger, engine_state table, effectiveness table, health RPC, log cleanup, dry-run column, column comments |
| `supabase/functions/auto-price-engine/index.ts` | Rest timer check, conflict detection, anomaly alerts, circuit breaker logic, dry-run mode |
| `src/components/terminal/automation/AutoPricingRules.tsx` | Effectiveness summary cards (inline) |
| `src/components/terminal/automation/AutoPricingRuleDialog.tsx` | Dry-run toggle |
| `src/hooks/useAutoPricingRules.ts` | Add `is_dry_run` to interface, add health RPC hook |

