

# Updated Plan — Verified Name Identity System (Non-Unique)

## Critical Correction

Verified names are **immutable per client** but **NOT globally unique**. Two different people can share the same KYC-verified name (e.g., "AMBER GANDOTRA" currently maps to 2 different clients). Therefore:

- `client_verified_names` must use a **composite unique constraint** on `(client_id, verified_name)` — NOT a unique constraint on `verified_name` alone.
- Identity resolution by verified name alone may return **multiple candidates** — it must be combined with nickname or other signals to disambiguate.

Live data confirms: 2 verified names currently map to 2+ clients each.

---

## Revised Plan (5 Steps)

### Step 1: Create `client_verified_names` Table (Corrected Schema)

```sql
client_verified_names
├── id (UUID PK)
├── client_id (FK → clients, NOT NULL)
├── verified_name (TEXT, NOT NULL)
├── source (TEXT: 'approval', 'auto_sync', 'backfill')
├── first_seen_at (TIMESTAMPTZ)
├── last_seen_at (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── UNIQUE(client_id, verified_name)  -- NOT unique on verified_name alone
```

Index on `verified_name` (non-unique) for fast lookups. RLS for authenticated users.

### Step 2: Add Index on `p2p_order_records(counterparty_nickname)`

Single migration — btree index for the heavily queried nickname column.

### Step 3: One-Time Backfill

**A.** Populate `client_verified_names` from `terminal_sales_sync` where `client_id` is set and `verified_name` exists in order_data.

**B.** Link orphaned unmasked nicknames from `p2p_order_records` to clients via sync tables that already have `client_id`.

**C.** Backfill `client_id` on unmatched sync records — but ONLY where the verified_name + nickname combination resolves to exactly ONE client (skip ambiguous matches).

### Step 4: Update Sync Hooks — Multi-Signal Resolution

**Files:** `useTerminalSalesSync.ts`, `useTerminalPurchaseSync.ts`

New resolution hierarchy with disambiguation:

1. **Priority 0**: Lookup `client_verified_names` by verified name. If exactly 1 client → use it. If multiple clients share the name → fall through to nickname for disambiguation.
2. **Priority 1**: Lookup `client_binance_nicknames` by unmasked nickname (existing).
3. **Priority 2**: If verified name returned multiple candidates AND nickname matched one of them → use that intersection.
4. **Priority 3**: Case-insensitive name match against clients table (existing fallback).

After matching, auto-upsert verified name into `client_verified_names` with composite key.

### Step 5: Update Approval Flows

**Files:** `ClientOnboardingApprovals.tsx`, `SellerOnboardingApprovals.tsx`, `TerminalSalesApprovalDialog.tsx`, `TerminalPurchaseApprovalDialog.tsx`

On approval, upsert verified name into `client_verified_names` (using composite `client_id + verified_name`). This builds the identity graph over time.

### Step 6: Save Memory

Store the verified name rules: immutable per client, NOT globally unique, must combine with nickname for disambiguation.

---

## Key Difference from Previous Plan

| Aspect | Previous Plan | Updated Plan |
|--------|--------------|--------------|
| `verified_name` uniqueness | UNIQUE (global) | UNIQUE(client_id, verified_name) — composite |
| Lookup by verified name | Direct → single client | May return multiple → requires disambiguation |
| Resolution logic | Verified name alone sufficient | Verified name + nickname intersection |
| Backfill matching | All verified name matches | Only unambiguous matches (1 client per name) |

## Impact

Same benefits as before (improved match rates, progressive enrichment) but without the risk of misattributing orders when two different clients share the same verified name.

