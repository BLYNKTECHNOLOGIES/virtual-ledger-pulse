

## Binance Nickname-to-Client Linking System

### Problem
Client mapping during sales/purchase sync relies on fragile name matching, causing many orders to land in `client_mapping_pending`. Additionally, unmasked Binance nicknames are only visible while orders are active — once completed, Binance masks them (e.g., `Use***`).

### Key Insight
The `sync_p2p_order` RPC already captures the **unmasked nickname** into `p2p_order_records.counterparty_nickname` while the order is active. This is the reliable capture point. Once an operator maps a client during approval, we persist that nickname→client link. All future orders from the same nickname auto-resolve.

### Architecture

```text
Order active on terminal
  └─ sync_p2p_order() saves unmasked nickname to p2p_order_records ✓ (already works)

Sales/Purchase sync runs
  ├─ Step 1: Lookup client_binance_nicknames WHERE nickname = unmasked_nick
  │   ├─ FOUND → auto-assign client_id → "synced_pending_approval"
  │   └─ NOT FOUND → fall back to name matching (existing logic)
  └─ Step 2: On approval (operator maps client)
      └─ INSERT nickname → client_binance_nicknames (auto-capture)
```

### Implementation Steps

**1. Database Migration — `client_binance_nicknames` table**
- Columns: `id` (uuid PK), `client_id` (FK to clients), `nickname` (text, UNIQUE), `is_active` (bool), `source` (text: `sync_auto` | `manual` | `approval`), `first_seen_at`, `last_seen_at`, `created_at`
- RLS: authenticated read/insert/update
- Unique constraint on `nickname` ensures one nickname = one client

**2. Update `useTerminalSalesSync.ts`**
- After building the client name map, also fetch `client_binance_nicknames` for all unmasked nicknames from `p2p_order_records`
- If a nickname match is found, use that `client_id` directly (bypasses name matching)
- Store the unmasked nickname in `order_data.counterparty_nickname_unmasked` (same pattern as purchase sync)

**3. Update `useTerminalPurchaseSync.ts`**
- Same nickname-based client lookup before name matching
- Already fetches unmasked nicknames from `p2p_order_records` — add the `client_binance_nicknames` lookup step

**4. Update `TerminalSalesApprovalDialog.tsx`**
- On successful approval with a client mapping, auto-insert/upsert the counterparty's unmasked nickname into `client_binance_nicknames` linked to the selected client
- Source: `approval`

**5. Update `TerminalPurchaseApprovalDialog.tsx`**
- Same auto-capture logic on approval

**6. Client Overview Panel**
- Display linked Binance nicknames in a read-only section on the client detail view
- Allow manual nickname addition/removal for admin users

**7. Backfill script**
- One-time SQL to populate `client_binance_nicknames` from existing approved sync records that have unmasked nicknames and valid `client_id` values (from both `terminal_purchase_sync` and `terminal_sales_sync`)

### Critical Design Decisions
- **Capture timing**: Unmasked nicknames are already saved by `sync_p2p_order` while orders are active — no additional capture needed at that stage
- **Conflict handling**: If a nickname already exists for a different client, the system flags it in the approval UI rather than silently reassigning
- **Nickname changes**: Old nicknames remain linked (historical); new ones get added on next approval. Array of nicknames per client is natural
- **No two clients share a nickname**: Enforced by UNIQUE constraint on `nickname` column

### Files to Modify
- New migration SQL (create `client_binance_nicknames` table)
- `src/hooks/useTerminalSalesSync.ts`
- `src/hooks/useTerminalPurchaseSync.ts`
- `src/components/sales/TerminalSalesApprovalDialog.tsx`
- `src/components/purchase/TerminalPurchaseApprovalDialog.tsx`
- `src/components/clients/ClientOverviewPanel.tsx` (or equivalent client detail component)

