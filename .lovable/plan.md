

## Goal

Show on each **Seller / Composite client's detail page** the list of **bank beneficiary records** (from BAMS) that belong to them — automatically resolved via the **Binance nickname link** captured on the order that created the beneficiary. Buyers get a blank/hidden block. No manual mapping UI.

## How identity resolution works (no schema changes needed)

`beneficiary_records` already stores `source_order_number`. From there we can walk to the order and then to the client:

```text
beneficiary_records.source_order_number
        │
        ▼
binance_order_history.order_number
        │  (counter_part_nick_name)
        ▼
client_binance_nicknames.nickname  →  client_id  →  clients
```

If the nickname for that order isn't linked to a client yet, the beneficiary simply doesn't appear anywhere — it stays unassigned in BAMS until the nickname gets enriched (via approval or terminal sync). At that point it auto-appears on the client page on next render. **No backfill cron, no manual base system.**

We only resolve via **unmasked nicknames** (already enforced by `sanitizeNickname` — masked `*` values are ignored). Display-name fallback is **not** used here, because beneficiary→client must be a strong link (bank details are sensitive).

## What gets built

### 1. New hook: `useClientBeneficiaries(clientId)`
File: `src/hooks/useClientBeneficiaries.ts`

- Step A: fetch all unmasked nicknames for this client from `client_binance_nicknames` (where `is_active=true`).
- Step B: fetch `binance_order_history` rows where `counter_part_nick_name IN (...nicknames)` and `trade_type='BUY'` (BUY = we bought, seller = this client) — select `order_number`.
- Step C: fetch `beneficiary_records` where `source_order_number IN (...order numbers)`.
- Deduplicate by `account_number` (a client may have multiple accounts; same account across many orders = one row, keep latest `last_seen_at`).
- Returns `{ beneficiaries, isLoading }`.

If the client has zero linked nicknames → return `[]` immediately.

### 2. New panel component: `ClientBeneficiaryDetails`
File: `src/components/clients/ClientBeneficiaryDetails.tsx`

Card layout matching existing client-detail panels (`KYCBankInfo` style). For each beneficiary row, display:

- Account holder name
- Bank name + Account number (masked — show last 4)
- IFSC, Account type, Opening branch (when present)
- Small footer: "Captured from order `…1234`" + last seen date
- Empty state: "No beneficiary bank details captured yet. They will appear automatically once a completed sell order from this client is synced."

Loading skeleton while fetching.

### 3. Wire into Client Detail page
File: `src/pages/ClientDetail.tsx`

Add a new row that renders only for sellers and composites:

```tsx
{(isSeller || showAsSellerOnly || isComposite) && (
  <div className="grid grid-cols-1 gap-6">
    <ClientBeneficiaryDetails clientId={clientId} />
  </div>
)}
```

Place it right after the TDS Records row (Row 4) so bank/financial info groups together. **Buyers** (no sell orders) will not see this card at all — matches the "blank space for buyers" requirement.

## Edge cases handled

- **Masked nickname on the order** → that order is filtered at Step B (we query by linked nicknames, which are already unmasked-only).
- **Beneficiary captured before nickname link existed** → as soon as the nickname gets linked (next approval/sync), the next page load resolves it. No migration needed.
- **Same account across multiple orders** → deduped by `account_number`, count shown if useful.
- **Client has multiple Binance nicknames** → all are queried together, all their orders' beneficiaries surface on one page.
- **Beneficiary belongs to a different person sharing a name** → cannot happen, because we resolve via nickname (unique per Binance account), not by name string.

## Out of scope / not built

- No UI to manually attach/detach a beneficiary from a client (auto-only as requested).
- No edit of beneficiary fields from the client page (BAMS remains the single edit surface).
- No "orphaned beneficiaries" view — already visible in BAMS Beneficiary tab.
- No DB schema change, no new column on `beneficiary_records`.

