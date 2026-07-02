# TDS "Entry Already Recorded" (No Bank Deduction) + Liability Clearing

## Problem
In **Tax Management → Record TDS Payment**, the only way to settle selected TDS entries is to deduct the total from a company bank account (creates an expense on `bank_transactions`). Sometimes the TDS entry has already been paid/recorded externally, so **no bank deduction should happen** — but those entries must still be marked settled and, critically, must stop counting as pending TDS liability everywhere (Total Asset Value, daily snapshot, reports).

## Root-cause finding (important)
There is a pre-existing gap that must be fixed for this to actually work:

- Payment settlement writes to **`tds_payment_allocations.payment_status`** (via the Record TDS Payment dialog).
- But every **liability calculation reads `tds_records.payment_status`**:
  - `supabase/functions/snapshot-asset-value/index.ts` (Total Asset Value daily snapshot)
  - `src/components/financials/TotalAssetValueWidget.tsx` (live TAV pending-TDS)
  - `supabase/functions/daily-report-email/index.ts`
- There is **no trigger or code** syncing `tds_payment_allocations` → `tds_records`. Confirmed: no such trigger exists, and one `tds_record` maps to one PO while a PO can have up to 3 allocations (split payments).

So today even a *normal* TDS payment does not clear the liability in TAV. The fix below closes this for both the normal and the new "already recorded" path.

## Solution Overview
1. Add an **"Entry already recorded (no bank deduction)"** toggle to the Record TDS Payment dialog.
2. When enabled: skip bank-account requirement, create **no** `bank_transactions` expense, and mark the selected allocations PAID but flagged as pre-recorded.
3. Add a DB trigger so that whenever a PO's allocations become fully PAID, the matching `tds_records.payment_status` is set to `PAID` (and back to `UNPAID` otherwise). This makes the liability clear consistently everywhere, for both normal and already-recorded payments.

## Changes

### 1. Database migration
- Add nullable column `already_recorded boolean DEFAULT false` to `tds_payment_allocations` (marks entries settled without a bank deduction, for audit/export).
- Add a `SECURITY DEFINER` trigger function on `tds_payment_allocations` (AFTER INSERT/UPDATE/DELETE, per affected `purchase_order_id`):
  - Compute whether the PO has ≥1 allocation and **all** its allocations are `PAID`.
  - Set the PO's `tds_records.payment_status` to `PAID` when fully paid, else `UNPAID`.
  - Idempotent, so it is safe with `rebuild_tds_allocations` (which deletes/re-inserts allocations preserving prior status).
- One-time backfill: reconcile existing `tds_records.payment_status` from current allocation state (all currently UNPAID, so effectively a no-op, but keeps them consistent).

### 2. `src/components/accounting/TaxManagementTab.tsx`
- Add `alreadyRecorded` state (checkbox) inside the Record TDS Payment dialog.
- When `alreadyRecorded` is true:
  - Hide/relax the "Deduct from … Bank Account *" requirement (bank selection not required).
  - `bulkPaymentMutation`: update allocations with `payment_status='PAID'`, `already_recorded=true`, `paid_at`, `paid_by`, `payment_batch_id` (prefix e.g. `TDS-PRERECORDED-…`), `payment_bank_account_id=null`; **do not** insert into `bank_transactions`.
  - Success toast reads "Marked as already recorded (no bank deduction)".
- When `alreadyRecorded` is false: existing behavior unchanged (bank required, expense created).
- Update the amber note text to reflect the chosen mode.
- Reset `alreadyRecorded` on dialog close/success.
- Optional: in the table status cell / export, show a distinct label such as "Paid (Pre-recorded)" when `already_recorded` is true (Export gets an extra hint in the Status column). No layout changes.

### 3. No changes needed to liability readers
`snapshot-asset-value`, `TotalAssetValueWidget`, and `daily-report-email` already filter on `tds_records.payment_status != 'PAID'`; the new trigger makes them reflect settlements automatically.

## What stays unchanged
- All TDS amounts, rates, quarter/company/rate grouping, and existing normal-payment behavior.
- Permissions, workflows, and the bank-deduction expense path for normal payments.
- The `tds_payment_allocations` rebuild logic (trigger is additive and idempotent).

## Verification
- Typecheck clean.
- Manual: select entries → toggle "already recorded" → confirm → no `bank_transactions` row created, allocations marked PAID/`already_recorded`, `tds_records` for those POs flip to PAID, and TAV pending-TDS drops by the settled amount.
- Confirm normal payment path still creates the expense and now also clears the matching `tds_records`.
