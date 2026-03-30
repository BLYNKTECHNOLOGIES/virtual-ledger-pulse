

# Fix: Manual Purchase "function is not unique" Error

## Root Cause

The last migration created a **second overloaded version** of `create_manual_purchase_complete_v2` with a new `p_deduction_bank_account_id` parameter, but did NOT drop the old 16-param version first. Now there are two functions with the same name but different signatures:

1. **Old (16 params)**: `p_bank_account_id` at position 8, no `p_deduction_bank_account_id`
2. **New (17 params)**: `p_bank_account_id` at position 10, adds `p_deduction_bank_account_id` at position 11

When `create_manual_purchase_complete_v2_rpc` tries to call `create_manual_purchase_complete_v2`, PostgreSQL cannot disambiguate → "is not unique" error.

## Fix

**Single migration** that:
1. Drops the OLD 16-param overload (the one without `p_deduction_bank_account_id`)
2. Keeps the NEW 17-param version from the latest migration
3. Updates `create_manual_purchase_complete_v2_rpc` wrapper to pass params matching the new signature

### Technical Details

```sql
-- Drop old overload
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(
  text, text, date, numeric, uuid, numeric, numeric, uuid,
  text, text, uuid, text, text, numeric, boolean, uuid
);

-- Recreate _rpc wrapper to match new signature
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2_rpc(...)
  -- routes to the 17-param version with named args
```

The frontend code in `ManualPurchaseEntryDialog.tsx` does NOT send `p_deduction_bank_account_id`, so the wrapper must pass `NULL` for it (it has a default anyway).

No frontend changes needed — the `_rpc` wrapper handles the routing.

