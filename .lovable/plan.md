

## Why a "Known Client" still appears in Buyer Approvals

### Root cause — by design, but flawed

The trigger `create_client_onboarding_approval` (in migration `20260311123352…`) decides whether to push an approval row using a **single check**:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.clients
  WHERE name = NEW.client_name
)
```

This is a **strict, exact, case-sensitive name match against `clients.name` only**. It does NOT consider:

1. **Binance nickname links** (`client_binance_nicknames`) — the strongest identity signal we have.
2. **Verified KYC name links** (`client_verified_names`) — the second-strongest signal.
3. **Buyer/seller side**: an existing seller-only client triggers a brand-new buyer approval even though they already exist as a client.
4. **Case / whitespace variations** in `client_name`.

So a client we already know via nickname/KYC name will still generate a new approval row whenever Binance returns the counterparty's display name in any form different from the stored `clients.name`. The UI then enriches that row in the front-end and shows the blue **"🔗 Known Client"** badge — but the row was already created by then.

### Concretely what you're seeing

The badge in the screenshot means: **"This pending approval row is for a Binance counterparty whose nickname is already linked to an existing client. Approving it should not create a duplicate — it should flip the existing client's `buyer_approval_status` to APPROVED."**

The approval logic in `ClientOnboardingApprovals.tsx` (lines 482–540) **does already handle this correctly when approved**:

- If a client is found by phone → updates the existing client (no duplicate).
- If not → creates a new client.

But there are two real problems:

| # | Problem | Effect |
|---|---------|--------|
| 1 | The DB trigger inserts the approval even when nickname/verified-name resolves to an existing client | Operator sees noise: known clients keep showing in the queue |
| 2 | The "merge into existing" logic on approval only looks up by **phone**, not by nickname or verified name | If phone is missing on the approval row, a duplicate client gets created even though the badge said "Known Client" |

### My view

The **"Known Client" badge is correctly identifying** the situation. The bug is upstream:

- The DB trigger should not enqueue an approval when the counterparty is already resolvable to an existing **buyer-approved** client.
- When it IS enqueued (e.g. existing seller becoming a buyer, or existing client whose buyer side is still PENDING), the approval should be marked as a **"side-extension"** — UI should show "Approve as Buyer" rather than "Onboard new client", and approval must merge into the resolved client by **id**, not by phone.

This is also why you saw "ATUR KHANDHAR" earlier: a known seller client was generating an approval row for the buyer side, and the directory hides PENDING buyers.

## Proposed fix (DB + UI, no schema change)

### 1. Smarter DB trigger
Replace `create_client_onboarding_approval` so it **skips inserting** when the counterparty resolves to an existing client whose buyer side is already APPROVED. Resolution order, mirroring `clientIdentityResolver.ts`:

1. Unmasked Binance nickname (from the originating sales order) → `client_binance_nicknames`
2. Verified name → `client_verified_names`
3. Exact case-insensitive `clients.name`
4. Phone match (when available)

If resolved AND `buyer_approval_status = 'APPROVED'` → **do nothing** (no duplicate).
If resolved AND buyer status is `PENDING / NULL / NOT_APPLICABLE` → **insert approval**, but stamp a new column `resolved_client_id` (add it) so the UI knows this is a side-extension.
If unresolved → insert as today (true new client).

### 2. UI uses `resolved_client_id` as the source of truth
In `ClientOnboardingApprovals.tsx`:

- When `resolved_client_id` is present, hide the "Create New" / "Link by Phone" choice — the row is locked to the resolved client.
- The button reads **"Approve as Buyer for {existing client name}"** — purely flips `is_buyer = true` and `buyer_approval_status = 'APPROVED'` on that exact id.
- When no `resolved_client_id`, behavior is unchanged.

### 3. One-time cleanup
Run an idempotent script to:
- Mark currently-pending approval rows whose counterparty resolves to an already-buyer-APPROVED client as `APPROVED` (auto-clear noise).
- Stamp `resolved_client_id` on the rest so the new UI flow takes over immediately.

### 4. Same treatment for the seller side
`SellerOnboardingApprovals.tsx` reads from `clients` directly (not from a queue table), so the equivalent fix is just: when `linked_known`, the only allowed action becomes "Approve as Seller for existing client" — no chance of accidentally creating a parallel record.

## Files touched

- `supabase/migrations/<new>.sql` — replace trigger fn, add `resolved_client_id uuid` to `client_onboarding_approvals`, run cleanup.
- `src/components/clients/ClientOnboardingApprovals.tsx` — branch on `resolved_client_id`, simplified approve path.
- `src/components/clients/SellerOnboardingApprovals.tsx` — when `linked_known`, hard-lock approval to that client id.

## Out of scope

- No change to nickname/verified-name capture.
- No change to risk taxonomy or KYC document handling.
- No backfill of historical approved/rejected rows.

