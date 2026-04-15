

# Updated Plan — Data Integrity Improvements (Corrected Assumptions)

## Corrections Applied

| Wrong Assumption | Corrected Understanding |
|-----------------|------------------------|
| Manual entries = system failure | Manual entries are from **other trading platforms** (not Binance). Only Binance has API sync. This is by design. |
| Uppercase normalization of verified names | **Do NOT normalize case.** Binance always returns the same casing for a given client. Case differences between a verified name and a client name are a **useful signal** — they can help distinguish different clients or flag data issues. |
| Nicknames available for all orders | Nicknames/user IDs are **Binance-only**. Other platform orders will never have nicknames. Identity resolution must gracefully handle orders with no nickname data at all. |

## What This Changes in the Current Code

### 1. Remove Case-Insensitive Verified Name Matching

**Current code issue** in `clientIdentityResolver.ts` line 57: `verifiedNameMap.get(verifiedName)` — this is already case-sensitive (exact match), which is correct.

**However**, Priority 3 (line 83) uses `counterpartyName.toLowerCase()` for the name-match fallback against clients. This is acceptable for the fallback since client names in the DB may have inconsistent casing from manual entry. But verified name lookups must remain **exact case**.

**Action**: No code change needed for the resolver — it already does exact-match for verified names. Good.

### 2. Clean Up Case-Duplicate Verified Names in DB

The backfill created duplicate entries like "RAHUL" and "Rahul" for the same client. Since Binance always returns consistent casing, only one is the real Binance-sourced name. The other came from the client name field during backfill.

**Action**: One-time data cleanup — for each client with multiple case-variants of the same verified name, keep only the one that matches actual Binance order data (from `terminal_sales_sync.order_data->>'verified_name'`). Delete the backfill-generated duplicate.

### 3. Fix Mislinked Verified Names

Three clients have verified names that don't belong to them (e.g., "Gursharan Singh" linked to "SUJAY A P"). These were created by the backfill matching on masked nicknames.

**Action**: Delete these 3 incorrect entries from `client_verified_names`. The correct linkage will be rebuilt naturally when future orders for these clients come through with proper verified names.

### 4. Persist Verified Names to `binance_order_history` in Sales Sync

**Current gap**: `useTerminalSalesSync.ts` fetches verified buyer names from the API but doesn't save them back to `binance_order_history`. The purchase sync already does this. This means 14,699 SELL orders lack verified names in the history table, and every re-sync re-fetches from the API.

**Action**: Add one line in `useTerminalSalesSync.ts` after successful API enrichment to update `binance_order_history.verified_name`.

### 5. Link 46 Orphaned Nicknames

46 unmasked nicknames in `p2p_order_records` can be linked to clients via their verified names. Missed by initial backfill.

**Action**: One-time SQL insert into `client_binance_nicknames`.

### 6. Fix 29 Pending Records That Match Existing Clients

29 `client_mapping_pending` sales records have counterparty names matching existing clients but weren't caught during sync — likely whitespace issues.

**Action**: One-time SQL update to set `client_id` and change status to `synced_pending_approval` for these 29 records. Add `trim()` to the name-matching logic in the resolver.

### 7. Update Memory

Save three new rules:
- Manual entries are from non-Binance platforms — not system failures
- Do NOT normalize verified name casing — Binance casing is consistent and case differences are an identity signal
- Nicknames/user IDs are Binance-only; other platform orders have no nickname data

---

## Files Changed

| File | Change |
|------|--------|
| `useTerminalSalesSync.ts` | Add `binance_order_history` update after verified name fetch |
| `clientIdentityResolver.ts` | Add `trim()` to name-match fallback |
| Migration (data cleanup) | Remove 3 mislinked + ~4 case-duplicate verified names |
| Migration (data enrichment) | Link 46 orphaned nicknames, fix 29 pending matches |
| Memory files | Update identity rules with corrected assumptions |

## What Is NOT Changed (Confirmed Correct)

- Verified name lookup remains **exact case match** (no normalization)
- Identity resolution gracefully returns `null` when no nickname exists (works for non-Binance orders)
- Manual entries flow remains untouched — it works as designed for multi-platform trading
- The composite unique constraint `(client_id, verified_name)` on `client_verified_names` remains correct

