

# Plan — Stop Treating `Unknown` / Masked Nicknames As Identity

## Root cause (confirmed by live data)

The system is storing literal sentinel strings as if they were real Binance nicknames. Live counts:

| Sentinel stored as nickname | Distinct clients sharing it |
|---|---|
| `Unknown` | **9 unrelated people** |
| `Use***` (masked) | **10** |
| `P2P***` (masked) | **3** |

Plus 1 row in `client_binance_nicknames` is literally `nickname = 'Unknown'`. The "⚠ Same User — different name" badge then groups all of them as one person — a serious data-integrity false-positive.

There are two leaks:
1. The DB trigger reads `p2p_order_records.counterparty_nickname` and only filters `NOT LIKE '%*%'` — it does **not** reject the literal `'Unknown'`.
2. `SellerOnboardingApprovals.tsx` builds its "Same User" map keyed purely on the nickname string, so any shared sentinel collapses N people into one group.
3. The trigger writes `v_nickname` directly into `client_onboarding_approvals.binance_nickname` even when it is `'Unknown'`, polluting the queue.

## Fix — strict sentinel rejection + safer fallbacks

### 1. Centralize the "is this a real nickname?" check
Add a single helper used everywhere:
```ts
// already exists: src/lib/clientIdentityResolver.ts → sanitizeNickname
// rule: reject null, '', 'Unknown' (case-insensitive), anything containing '*'
```
Audit every read site (`SellerOnboardingApprovals`, `ClientOnboardingApprovals`, sync hooks) to route through `sanitizeNickname` before grouping or linking. Treat anything it rejects as **"no nickname"**, not as an identity key.

### 2. DB trigger — never store sentinels as nickname
In `create_client_onboarding_approval`:
- Filter `p2p_order_records` with `counterparty_nickname NOT LIKE '%*%' AND counterparty_nickname <> 'Unknown' AND TRIM(counterparty_nickname) <> ''`.
- If only sentinel candidates exist, leave `v_nickname = NULL` so the row stores nothing in `binance_nickname`.

### 3. DB trigger — fall back to **verified name + phone**, never to a sentinel
When nickname is missing, identity resolution must rely on the next-strongest signals:
1. Verified name → single match
2. Phone → single match
3. Exact case-insensitive name + phone (compound)

If none of these resolve, the row becomes a true **New Client** — never grouped with other unknowns.

### 4. UI — "Same User" must NEVER group by sentinel
In `SellerOnboardingApprovals.tsx` (and the same code path in `ClientOnboardingApprovals.tsx`):
- Skip nicknames rejected by `sanitizeNickname` when building the `nicknameGroups` map.
- For sellers with no real nickname, run a secondary grouping by **verified KYC name** (using `client_verified_names` look-alike). If two pending rows share the same verified name, *that* is a legitimate "same user" hit and gets the purple badge.
- If neither nickname nor verified name is available, render a new neutral badge: **"⚠ No identity signal — review manually"** (amber). Never auto-group.

### 5. One-time DB cleanup
Idempotent migration:
- `UPDATE client_binance_nicknames SET is_active = false WHERE nickname IS NULL OR nickname = '' OR nickname ILIKE 'unknown' OR nickname LIKE '%*%';`
- `UPDATE client_onboarding_approvals SET binance_nickname = NULL WHERE binance_nickname IS NULL OR binance_nickname = '' OR binance_nickname ILIKE 'unknown' OR binance_nickname LIKE '%*%';`
- Add a `CHECK` constraint (via validation trigger, per project rules) on `client_binance_nicknames` rejecting future inserts of sentinel values.
- Re-run the resolved-client-id backfill from migration `20260419150241…` so the 216 pending rows get re-evaluated against verified-name/phone (174 will resolve, 42 will become true New Clients).

## After the fix — what each row in your screenshot will look like

| Row | Current badge (wrong) | New badge (correct) |
|---|---|---|
| ROHIT GHOSH | ⚠ Same User (false group with 8 others) | If verified-name matches existing client → 🔗 / ✓ badge; else **New Client** |
| SYED REEHAN PASHA | ⚠ Same User (false) | **New Client** (or KYC match if any) |
| Jannatul Ferdous | ⚠ Same User (false) | **New Client** |
| NIMESH PARDESHI | New Client | unchanged |

## Files touched

- New migration:
  - Replace `create_client_onboarding_approval` (sentinel filter + verified-name/phone fallback).
  - Add validation trigger on `client_binance_nicknames` rejecting sentinel inserts.
  - Cleanup UPDATE for existing pollution + re-run backfill.
- `src/lib/clientIdentityResolver.ts` — confirm `sanitizeNickname` already rejects `'Unknown'` (it does — line 12). Export a matching `sanitizeVerifiedName`.
- `src/components/clients/SellerOnboardingApprovals.tsx` — wrap nickname reads with `sanitizeNickname`; add verified-name secondary grouping; new amber "no identity signal" badge.
- `src/components/clients/ClientOnboardingApprovals.tsx` — same three changes.
- `src/hooks/useTerminalSalesSync.ts` & `src/hooks/useTerminalPurchaseSync.ts` — ensure no sentinel ever reaches `client_binance_nicknames`.

## Out of scope

- No change to the resolved_client_id logic from the previous plan.
- No change to KYC document handling, risk taxonomy, or order sync workflows.
- No backfill of historical APPROVED/REJECTED rows — only PENDING ones get re-evaluated.

