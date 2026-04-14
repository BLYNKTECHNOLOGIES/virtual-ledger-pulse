

## Nickname-Based Client Deduplication in Approvals

### Problem
Currently, buyer onboarding approvals group pending records by **client name** (case-insensitive). If the same person trades under different verified names (e.g., "Vanshaj Kaistha" vs "VANSHAJ KAISTHA"), they appear as separate entries. Operators must manually cross-check order histories to determine if two clients are the same person. Seller approvals have the same issue.

The `p2p_order_records` table already has **5,580 records with unmasked nicknames** — a reliable unique identifier per Binance user. We can use this to automatically detect and surface when multiple pending approvals belong to the same counterparty.

### Architecture

```text
Buyer/Seller Approval Page loads
  ├─ Fetch pending approvals (existing)
  ├─ For each approval, join via sales_order_id → terminal_sales_sync → p2p_order_records
  │   to resolve the unmasked Binance nickname
  ├─ Also check client_binance_nicknames for known client links
  ├─ Group approvals by nickname (in addition to existing name grouping)
  └─ Surface in UI:
      ├─ "Binance ID" column showing unmasked nickname
      ├─ "Same User" badge when multiple different-name approvals share a nickname
      └─ Auto-suggest "Link to Existing" when nickname already maps to approved client
```

### Implementation Steps

**1. Enrich pending approvals with Binance nicknames (buyer approvals)**
- In `ClientOnboardingApprovals.tsx`, after fetching pending approvals, batch-query `terminal_sales_sync` for all `sales_order_id`s to get `binance_order_number`
- Then batch-query `p2p_order_records` for those order numbers to get unmasked `counterparty_nickname`
- Also query `client_binance_nicknames` to check if any nickname already maps to an existing approved client
- Build a `Map<approvalId, { nickname, existingClientId? }>` for UI consumption

**2. Enhance the buyer approval table UI**
- Add a "Binance ID" column showing the unmasked nickname (or "—" for legacy/non-terminal records)
- Group pending approvals by nickname when multiple different-name approvals share one — show a colored "Same User" badge linking them
- When a nickname already exists in `client_binance_nicknames`, show an auto-match indicator with the linked client name, pre-selecting "Link to Existing" mode

**3. Enhance the seller approval table (SellerOnboardingApprovals.tsx)**
- Same nickname enrichment via `terminal_purchase_sync` → `p2p_order_records`
- Add "Binance ID" column
- Show "Same User" badge for sellers that share a nickname with different names
- Auto-suggest merge when nickname links to an existing approved client

**4. Auto-capture nickname on buyer approval**
- When a buyer is approved (normal or merge), upsert the unmasked nickname into `client_binance_nicknames` — same pattern already used in sales/purchase approval dialogs

**5. Legacy data safety**
- All nickname enrichment is additive (read-only lookups) — no modification to existing approval records
- Approvals without terminal sync records (manual sales entries, legacy data) will show "—" in the Binance ID column and work exactly as before
- The existing name-based grouping (`pendingByClient`) remains as the primary grouping; nickname grouping adds a secondary visual indicator
- No schema changes needed — uses existing `p2p_order_records` and `client_binance_nicknames` tables

### Files to Modify
- `src/components/clients/ClientOnboardingApprovals.tsx` — Nickname enrichment query + UI column + grouping badges + auto-capture on approval
- `src/components/clients/SellerOnboardingApprovals.tsx` — Same enrichment for sellers via purchase_orders/terminal_purchase_sync

### No database migration needed
All data already exists in `p2p_order_records` and `client_binance_nicknames`.

