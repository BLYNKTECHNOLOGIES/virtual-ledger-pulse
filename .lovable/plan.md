

# Terminal Logs Overhaul: Category-Based Filtering + Order/Automation/Asset Logging

## Overview

The current Terminal Logs page only shows ad-related actions from the `ad_action_logs` table. This plan expands it into a unified action log that covers **four categories**: Ads, Orders, Automations, and Assets -- each with its own action types and two-tier filtering.

## Current State

- `ad_action_logs` table stores ad actions (created, updated, status changed, rest mode, bulk ops)
- Order actions (mark paid, release, cancel, verify) in `useBinanceActions.tsx` do NOT log anywhere
- Automation settings changes (auto-pay toggle, small sales config, auto-reply rules, schedules) do NOT log anywhere
- Spot trades are logged in `spot_trade_history` table but NOT surfaced in the Logs tab
- The Logs UI has a single flat filter dropdown for ad action types only

## What Changes

### 1. Expand the `ad_action_logs` table to be a unified terminal action log

Add new action types for Orders, Automations, and Assets. The table structure already supports this -- `action_type` is a text field, `ad_details` and `metadata` are JSONB, and `adv_no` can hold order numbers or be null.

New action types to add:

**Orders:**
- `order.marked_paid` -- When operator clicks "Mark as Paid"
- `order.released` -- When operator releases crypto
- `order.cancelled` -- When operator cancels an order
- `order.verified` -- When operator verifies buyer identity

**Automations:**
- `automation.auto_pay_toggled` -- Auto-pay enabled/disabled
- `automation.auto_pay_minutes_changed` -- Minutes before expiry changed
- `automation.small_sales_toggled` -- Small sales classification enabled/disabled
- `automation.small_sales_range_changed` -- Min/max amount range updated
- `automation.auto_reply_rule_created` -- New auto-reply rule created
- `automation.auto_reply_rule_updated` -- Auto-reply rule modified
- `automation.auto_reply_rule_toggled` -- Auto-reply rule enabled/disabled
- `automation.auto_reply_rule_deleted` -- Auto-reply rule deleted
- `automation.schedule_created` -- Merchant schedule created
- `automation.schedule_updated` -- Merchant schedule modified
- `automation.schedule_toggled` -- Merchant schedule enabled/disabled
- `automation.schedule_deleted` -- Merchant schedule deleted

**Assets:**
- `asset.spot_trade_executed` -- Spot trade BUY/SELL executed
- `asset.spot_trade_failed` -- Spot trade failed

### 2. Add logging calls to action hooks

**File: `src/hooks/useBinanceActions.tsx`**
- Import `logAdAction` from `useAdActionLog`
- Add `logAdAction()` calls in `onSuccess` callbacks of:
  - `useMarkOrderAsPaid` -- log `order.marked_paid` with order number
  - `useReleaseCoin` -- log `order.released` with order number and auth method
  - `useCancelOrder` -- log `order.cancelled` with order number
  - `useConfirmOrderVerified` -- log `order.verified` with order number

**File: `src/hooks/useBinanceAssets.tsx`**
- Import `logAdAction` from `useAdActionLog`
- Add `logAdAction()` call in `useExecuteTrade` `onSuccess` with trade details (symbol, side, qty, price)
- Add logging for failed trades too

**File: `src/components/terminal/automation/AutoPaySettings.tsx`**
- Log when auto-pay is toggled on/off
- Log when minutes_before_expiry is changed

**File: `src/components/terminal/automation/SmallSalesConfig.tsx`**
- Log when small sales is toggled on/off
- Log when min/max range is saved

**File: `src/hooks/useAutomation.ts`**
- Log when auto-reply rules are created, updated, toggled, deleted
- Log when merchant schedules are created, updated, toggled, deleted

### 3. Update `useAdActionLog.ts` with new action types and category mapping

Add all new action types to `AdActionTypes` constant and add a category mapping:

```text
Categories:
  "ads"         -> ad.created, ad.updated, ad.status_changed, ad.bulk_*, ad.rest_*
  "orders"      -> order.marked_paid, order.released, order.cancelled, order.verified
  "automations" -> automation.*
  "assets"      -> asset.spot_trade_executed, asset.spot_trade_failed
```

Add `getActionCategory(actionType)` helper and update `getAdActionLabel()` with labels for all new types.

### 4. Redesign `TerminalLogs.tsx` with two-tier filtering

Replace the single action filter with two dropdowns:

**Filter 1 - Category**: All | Ads | Orders | Automations | Assets
**Filter 2 - Action**: Dynamically shows only actions belonging to the selected category

When "All" is selected in Filter 1, Filter 2 shows all action types.
When a specific category is selected, Filter 2 only shows that category's actions.

The timeline display remains the same but with updated badge colors per category:
- Ads: existing colors
- Orders: blue/green/red based on action
- Automations: purple/indigo
- Assets: amber/orange

### 5. Format details for new action types

Extend the `formatDetails()` function to handle:
- Order actions: show order number, trade type, asset, amount
- Automation actions: show what changed (old value -> new value), setting name
- Asset actions: show symbol, side, quantity, price, status

## Files to Modify

1. **`src/hooks/useAdActionLog.ts`** -- Add new action types, category mapping, labels
2. **`src/hooks/useBinanceActions.tsx`** -- Add logAdAction calls for order actions
3. **`src/hooks/useBinanceAssets.tsx`** -- Add logAdAction call for spot trades
4. **`src/components/terminal/automation/AutoPaySettings.tsx`** -- Add logging for settings changes
5. **`src/components/terminal/automation/SmallSalesConfig.tsx`** -- Add logging for config changes
6. **`src/hooks/useAutomation.ts`** -- Add logging for rule/schedule CRUD
7. **`src/pages/terminal/TerminalLogs.tsx`** -- Redesign with two-tier category + action filters

## No Database Changes Needed

The existing `ad_action_logs` table already has flexible text-based `action_type` and JSONB `ad_details`/`metadata` columns. No migration required -- just insert new action type strings.

## Future-Proofing

The category-based architecture means when new automation features are added:
1. Define a new `automation.xxx` action type in `AdActionTypes`
2. Add the label in `getAdActionLabel()`
3. Add `logAdAction()` call in the feature code
4. The Logs UI automatically picks it up via the `automations` category filter

