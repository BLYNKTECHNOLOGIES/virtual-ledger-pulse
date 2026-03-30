

# Phase 30: Fix PAN & Contact Auto-Population in Terminal Approvals

## Problem

When PAN and contact number are provided in the terminal (stored in `counterparty_pan_records` and `counterparty_contact_records`), they are not auto-populated into the purchase approval form. Additionally, existing client data is not overwritten when newer terminal data is available.

### Root Causes Found

**Purchase Approval (`TerminalPurchaseApprovalDialog.tsx`):**
1. **No contact/state form fields** — The dialog fetches counterparty phone/state but has no UI inputs to display or pass them
2. **`p_contact_number: null` hardcoded** (line 389) — Even though contact data is resolved, it's passed as `null` to the RPC
3. **PAN not overwriting** (line 426) — Client master PAN is only updated if `!existingClient?.pan_card_number` — existing PAN is never overwritten with newer terminal data
4. **Phone/state not overwriting on client master** (line 444-445) — Only updates if values differ, but the resolved data was never populated because of issue #1

**Sales Approval (`TerminalSalesApprovalDialog.tsx`):**
5. **Pre-fill priority wrong** (line 166) — `setContactNumber(prev => prev || phone)` means if client master phone was set first (from the auto-match effect), terminal data can't overwrite it. Terminal data should have highest priority per the form-autofill-precedence-rules memory.

## Changes

### 1. Purchase Approval — Add Contact/State Fields & Fix Data Flow

**File: `src/components/purchase/TerminalPurchaseApprovalDialog.tsx`**

- Add `contactNumber` and `clientState` state variables (like Sales dialog has)
- Add contact/state conflict tracking to the existing conflict banner
- In the resolve effect (line 78-159): auto-fill `contactNumber` and `clientState` from resolved sources (sync record → counterparty records → client master)
- Pass `p_contact_number: contactNumber || null` to both RPC calls (lines 389 and split payment equivalent)
- In the client master update block (line 416-450):
  - Use the form's `contactNumber` and `clientState` values (operator-confirmed)
  - Overwrite PAN on client if `panNumber` is provided and differs (remove the `!existingClient?.pan_card_number` guard)
  - Overwrite phone/state on client if provided and differs
- Add Contact Number and State input fields to the form UI (between Client Mapping and TDS sections)
- Add phone/state conflict items to the DataConflictBanner

### 2. Sales Approval — Fix Pre-fill Priority

**File: `src/components/sales/TerminalSalesApprovalDialog.tsx`**

- Change counterparty contact pre-fill (line 166-167) from `prev => prev || phone` to unconditionally set when terminal data exists — terminal-captured data is highest priority
- In client master update (lines 540-551): also overwrite PAN if available from counterparty records (currently Sales doesn't sync PAN to client at all)

### 3. Purchase Approval — Client Master PAN Overwrite

In the post-approval client sync block, change:
```
if (panNumber && !existingClient?.pan_card_number)
```
to:
```
if (panNumber && existingClient?.pan_card_number !== panNumber)
```

This ensures the latest operator-confirmed PAN overwrites stale client data.

## Data Flow After Fix

```text
Terminal operator enters PAN/Phone/State
  ↓
Stored in counterparty_pan_records / counterparty_contact_records
  ↓
Approval dialog opens → fetches from:
  1. Sync record (highest priority)
  2. Counterparty records (terminal-captured)
  3. Client master (fallback)
  ↓
Form pre-fills with resolved values (operator can edit)
  ↓
On approve:
  - Purchase/Sales order created with contact data
  - Client master updated (overwrite if different)
  - Counterparty records updated
```

## Summary

| Action | File | What |
|--------|------|------|
| Add contact/state fields + fix RPC params | `TerminalPurchaseApprovalDialog.tsx` | ~40 lines added/changed |
| Fix pre-fill priority | `TerminalSalesApprovalDialog.tsx` | ~6 lines changed |
| Enable PAN/phone/state overwrite | Both dialogs | ~4 lines changed |

**0 migrations, 2 frontend files.**

