
# Hybrid Adjust Feature for Ads Manager

## Overview

When a mix of fixed-price and floating-price ads are selected in the Ads Manager, a new **"Hybrid Adjust"** button will appear in the bulk action toolbar. This feature calculates a unified pricing strategy: fixed ads get a target USDT price, and floating ads get a calculated floating ratio based on live market rate, with an optional adjustment offset stored in system settings.

## Calculation Logic

```text
Given:
  Target USDT Price (user input)     = 96
  Live USDT/INR Market Rate          = 90.9
  Hybrid Price Difference Adjuster   = 0.3 (from automation settings)

Steps:
  1. Difference = Target Price - Market Rate = 96 - 90.9 = 5.1
  2. Raw Floating % = (Difference / Target Price) * 100 = 5.3125%
  3. Floating Ratio = 100 + Raw Floating % = 105.3125%
  4. Final Ratio = Floating Ratio - Adjuster = 105.3125 - 0.3 = 105.0125%

Result:
  - Fixed ads: price set to 96
  - Floating ads: ratio set to 105.01%
```

## Changes

### 1. Hybrid Price Difference Adjuster Setting (Automation Page)

**File: New component `src/components/terminal/automation/HybridPriceAdjuster.tsx`**
- A small card/section in the Automation page under a new or existing tab
- Input field to set the "Hybrid Price Difference Adjuster" value (e.g., 0.3)
- Stored in `system_settings` table with key `hybrid_price_difference_adjuster`
- Default value: 0

**File: `src/pages/terminal/TerminalAutomation.tsx`**
- Add the HybridPriceAdjuster component to the automation page (likely under the existing tabs or as a new section)

### 2. Bulk Action Toolbar - New "Hybrid Adjust" Button

**File: `src/components/ad-manager/BulkActionToolbar.tsx`**
- Add a new `onBulkHybridAdjust` callback prop
- Show "Hybrid Adjust" button when selection contains BOTH fixed (priceType=1) and floating (priceType=2) ads
- Use a distinctive icon (e.g., `Blend` or `Combine` from lucide)

### 3. New Hybrid Adjust Dialog

**File: New component `src/components/ad-manager/BulkHybridAdjustDialog.tsx`**
- Multi-step dialog (form -> confirm -> executing -> done), following the same pattern as `BulkFloatingPriceDialog`
- **Form step**: 
  - Shows live USDT/INR rate (from `useUSDTRate` hook)
  - Input for target USDT price (e.g., 96)
  - Displays the hybrid adjuster value (fetched from `system_settings`)
  - Auto-calculates and previews the resulting floating ratio
  - Shows summary: "Fixed ads will be set to X, Floating ads will get Y% ratio"
- **Confirm step**: Lists all ads with their old and new values
- **Execution step**: 
  - For floating ads: calls `useUpdateAd` with `priceType: 2` and calculated `priceFloatingRatio`
  - For fixed ads: calls `useUpdateAd` with `priceType: 1` and the target price
- **Done step**: Shows results summary

### 4. Hook for Hybrid Adjuster Setting

**File: New hook `src/hooks/useHybridPriceAdjuster.ts`**
- `useHybridPriceAdjuster()`: Fetches `hybrid_price_difference_adjuster` from `system_settings`
- `useUpdateHybridPriceAdjuster()`: Upserts the value

### 5. Parent Integration

**File: `src/pages/AdManager.tsx`**
- Add state for `bulkHybridOpen`
- Add `handleBulkHybridAdjust` callback
- Pass to `BulkActionToolbar` and render `BulkHybridAdjustDialog`

## Technical Details

- The live USDT/INR rate comes from the existing `useUSDTRate` hook (currently returning ~90.92 from CoinGecko)
- The adjuster setting uses the existing `system_settings` table (key-value store) -- no migration needed
- Fixed-price ad updates use `priceType: 1` with explicit `price` field in the Binance update API
- Floating-price ad updates use `priceType: 2` with `priceFloatingRatio` field
- Sequential API calls with 300ms delay between each (same pattern as existing bulk operations)
