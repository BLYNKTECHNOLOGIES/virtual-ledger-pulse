

# Phase 23: W24 + W25 Fixes

## W24 — Pricing Effectiveness Snapshots: ALREADY FIXED

The function `generate_pricing_effectiveness_snapshot()` exists (migration `20260329173629`) and a daily cron is already scheduled at `0 1 * * *` (migration `20260330103638`). The table will populate nightly. **No action needed.**

## W25 — Blocked Phone Validation in QuickSalesOrderDialog

**Current state:** `isPhoneBlocked()` is used in `TerminalSalesApprovalDialog` and `CounterpartyContactInput`, but `QuickSalesOrderDialog` (manual sales order creation) has zero blocked-phone checks. A blocked phone number can be submitted as `client_phone` and will flow into the `client_onboarding_approvals` table unchecked.

### Fix: Add blocked-phone validation to QuickSalesOrderDialog

**File:** `src/components/sales/QuickSalesOrderDialog.tsx`

1. Import `isPhoneBlocked` from `@/lib/blocked-phones`
2. Make `handleSubmit` async
3. Before mutation, if `client_phone` is non-empty, call `await isPhoneBlocked(formData.client_phone.trim())`
4. If blocked, add validation error: "This phone number is blocked — it's a known operator/placeholder number"
5. Prevent submission

This matches the exact pattern already used in `TerminalSalesApprovalDialog` and `CounterpartyContactInput`.

### Summary

| # | Item | Action |
|---|------|--------|
| W24 | Pricing snapshots | No action — cron already exists |
| W25 | Blocked phone in QuickSalesOrderDialog | Add `isPhoneBlocked` check to `handleSubmit` |

One file changed, no migrations needed.

