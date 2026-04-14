

## Future-Proof Nickname-to-Client Linking for Terminal Order View

### Current State & Shortfalls Identified

**Critical Issue: Backfill is empty.** The `client_binance_nicknames` table has **0 rows**. The original backfill SQL tried to extract nicknames from `terminal_sales_sync.order_data->>'counterparty_nickname'` — but those are **masked** (e.g., `Ast***`). Unmasked nicknames only exist in `p2p_order_records.counterparty_nickname`. The backfill must join through `p2p_order_records` instead.

**Available data for backfill:**
- 382 unique unmasked nicknames from approved sales sync records
- 275 unique unmasked nicknames from approved purchase sync records
- 5,581 total unmasked nicknames in `p2p_order_records`

### What This Plan Delivers

1. **Fix the backfill** — populate `client_binance_nicknames` with correct data by joining through `p2p_order_records`
2. **Future-proof the lookup path** for terminal → client directory: `p2p_order_records.counterparty_nickname` → `client_binance_nicknames.nickname` → `clients.*`
3. **No schema changes needed** — the existing table structure (`client_binance_nicknames` with UNIQUE on `nickname`, FK to `clients.id`) already supports direct terminal lookups

### Implementation

**Step 1: Run correct backfill migration**

```sql
-- Backfill from approved SALES sync via p2p_order_records (unmasked nicknames)
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (por.counterparty_nickname)
  tss.client_id,
  por.counterparty_nickname,
  'backfill',
  MIN(tss.synced_at) OVER (PARTITION BY por.counterparty_nickname),
  MAX(tss.synced_at) OVER (PARTITION BY por.counterparty_nickname)
FROM terminal_sales_sync tss
JOIN p2p_order_records por ON por.binance_order_number = tss.binance_order_number
WHERE tss.client_id IS NOT NULL
  AND tss.sync_status = 'approved'
  AND por.counterparty_nickname IS NOT NULL
  AND por.counterparty_nickname NOT LIKE '%*%'
ORDER BY por.counterparty_nickname, tss.synced_at DESC
ON CONFLICT (nickname) DO NOTHING;

-- Same for PURCHASE sync
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (por.counterparty_nickname)
  tps.client_id,
  por.counterparty_nickname,
  'backfill',
  MIN(tps.synced_at) OVER (PARTITION BY por.counterparty_nickname),
  MAX(tps.synced_at) OVER (PARTITION BY por.counterparty_nickname)
FROM terminal_purchase_sync tps
JOIN p2p_order_records por ON por.binance_order_number = tps.binance_order_number
WHERE tps.client_id IS NOT NULL
  AND tps.sync_status = 'approved'
  AND por.counterparty_nickname IS NOT NULL
  AND por.counterparty_nickname NOT LIKE '%*%'
ORDER BY por.counterparty_nickname, tps.synced_at DESC
ON CONFLICT (nickname) DO NOTHING;
```

**Step 2: No code changes needed now**

The existing schema already supports the future terminal use case:

```text
Terminal Running Order
  └─ p2p_order_records.counterparty_nickname (captured while order is active)
      └─ client_binance_nicknames.nickname (UNIQUE index, instant lookup)
          └─ clients.* (full directory: name, phone, PAN, risk level, bank accounts, KYC status, monthly limits)
```

When you're ready to show client data in the terminal order view, a single query like this will work:

```sql
SELECT c.name, c.phone, c.pan_card_number, c.risk_appetite, c.monthly_limit, c.current_month_used, c.kyc_status, c.state
FROM client_binance_nicknames cbn
JOIN clients c ON c.id = cbn.client_id
WHERE cbn.nickname = 'User-d79e3' AND cbn.is_active = true AND c.is_deleted = false;
```

### Why No Additional Schema Changes Are Needed

| Concern | Status |
|---------|--------|
| Nickname uniqueness | UNIQUE constraint on `nickname` — enforced |
| Fast lookup from terminal | Index `idx_client_binance_nicknames_active` on `(nickname) WHERE is_active = true` — covered |
| Client FK integrity | `ON DELETE CASCADE` from `clients(id)` — covered |
| Nickname changes by user | `is_active` flag allows deactivating old nicknames; new ones auto-captured on approval |
| Multiple nicknames per client | Supported (one row per nickname, all pointing to same `client_id`) |
| Legacy orders without nicknames | Will show "—" / no client match — graceful fallback |
| Auto-capture going forward | Already implemented in sales/purchase approval dialogs (upsert on approval) |

### Summary

The only action needed is the **corrected backfill migration** to populate `client_binance_nicknames` with ~500+ nickname-to-client links from historical approved orders. The database design is already future-proof for the terminal order → client directory lookup you described. No structural changes required.

