

# Fix Masked Nickname Contamination in "Same User" Detection & Client Matching

## Problem
Binance masks counterparty nicknames after ~24 hours (e.g., `Use***`, `P2P***`). Currently, ~81% of stored nicknames in `p2p_order_records` are masked. The "Same User — different name" detection in both Buyer and Seller onboarding approvals groups clients by these nicknames — so when two completely unrelated clients both show `Use***`, they're falsely flagged as the same person. This also risks masked nicknames being saved into `client_binance_nicknames` during approval, which would corrupt the auto-matching system.

**Scale**: `Use***` alone matches 9,194 orders across many different real clients.

## Plan

### 1. Filter masked nicknames from "Same User" detection

**Files**: `ClientOnboardingApprovals.tsx`, `SellerOnboardingApprovals.tsx`

In both enrichment queries and the grouping logic, skip any nickname containing `*`:
- In the p2p_order_records → nickname resolution step, discard nicknames with `*`
- In the "Same User" grouping loop, skip entries where the resolved nickname contains `*`
- This eliminates false positives from masked IDs

### 2. Guard against saving masked nicknames on approval

**Files**: `ClientOnboardingApprovals.tsx`, `SellerOnboardingApprovals.tsx`

Add a `!nickname.includes('*')` check before the `client_binance_nicknames.upsert()` calls during buyer/seller approval. This prevents masked nicknames from ever entering the linking table.

### 3. Backfill unmasked nicknames for legacy clients

**Logic**: When a returning client places a new order and the `p2p_order_records` entry has an unmasked nickname, the sync hooks (`useTerminalSalesSync.ts`, `useTerminalPurchaseSync.ts`) already use `counterparty_nickname_unmasked` for matching. However, if a client was onboarded with only masked data, their `client_binance_nicknames` entry may be missing.

**Fix in sync hooks**: After matching a client by name or ID, if the order has an unmasked nickname and no `client_binance_nicknames` entry exists for that nickname, auto-insert a link. This progressively enriches legacy clients as they trade again.

**Files**: `useTerminalSalesSync.ts`, `useTerminalPurchaseSync.ts`

### 4. Database cleanup (if needed)

Run a check for any masked nicknames that may have leaked into `client_binance_nicknames` — current data shows none exist, so this is just a safety verification.

## Summary of changes

| File | Change |
|------|--------|
| `ClientOnboardingApprovals.tsx` | Filter `*` from nickname enrichment + grouping; guard upsert |
| `SellerOnboardingApprovals.tsx` | Filter `*` from nickname enrichment + grouping; guard upsert |
| `useTerminalSalesSync.ts` | Auto-capture unmasked nickname → client link on matched orders |
| `useTerminalPurchaseSync.ts` | Auto-capture unmasked nickname → client link on matched orders |

