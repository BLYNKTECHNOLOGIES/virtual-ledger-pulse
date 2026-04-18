

## Goal

Use Binance **nickname + verified name** as the primary identity signal (instead of just the human name) so that:

1. In **Buyer/Seller Approvals**, the operator immediately sees whether the pending applicant is *truly* the same person as an existing client, or just a name collision.
2. In **Terminal Sales / Purchase approvals**, auto-matching to a client never silently merges two different people who happen to share a name.
3. Every approval row visibly carries the **Binance nickname + verified name** so reviewers can act on identity, not just on the display name.

## Current gaps (root cause)

- `client_onboarding_approvals` has no `binance_nickname` / `verified_name` columns. Today the badge "Known Client" is computed at render via a 3-hop join (`sales_order_id → terminal_sales_sync → p2p_order_records → client_binance_nicknames`). Fragile and not visible per-row.
- `TerminalSalesApprovalDialog` auto-links a client by **name string equality** (line 132). If two clients share a name, it forces manual choice — but if a nickname-linked client exists, that one should *win* and the other warning surfaced.
- "Known Client" badge today means only "this nickname is in `client_binance_nicknames`". It does not say "approved buyer" vs "approved seller" vs "deleted/rejected" — leading to operator confusion.

## Solution

### A. Persist identity on every approval row

Add two columns to `client_onboarding_approvals` (and the seller equivalent):

- `binance_nickname text` — unmasked nickname from `p2p_order_records`
- `verified_name text` — KYC verified name from Binance order detail

Backfill from existing `terminal_sales_sync.order_data` and `p2p_order_records`. Update the trigger that creates approval rows so new approvals always populate both.

### B. New 4-state identity match (replaces the single "Known Client" badge)

Computed per pending approval using nickname + verified name first, name only as last resort:

| State | Meaning | Badge |
|---|---|---|
| `linked_known` | Nickname is already in `client_binance_nicknames` → exact same person | Blue: "Known Client: {name} · @{nick}" |
| `verified_name_match` | Verified name matches an existing client's `client_verified_names` but nickname not yet linked | Teal: "Same KYC name — link nickname?" |
| `name_collision` | A client with the same display name exists, but nickname/verified name do NOT match → **different person, same name** | Amber: "⚠ Different person — same name as {existing}" |
| `new_client` | No match on any signal | Grey: "New Client" |

This directly answers the user's "two different people, same name" requirement — they will be **visually segregated**.

### C. Make the badge actionable

- Hovering `linked_known` shows: client_id, buyer/seller approval status, risk appetite, last order date.
- `name_collision` row gets a one-click "Confirm new person" or "This is actually {existing} — link nickname" button. The latter writes to `client_binance_nicknames` so the next order auto-matches correctly.

### D. Fix terminal approval auto-match precedence

In `TerminalSalesApprovalDialog` (and the purchase twin), change auto-link priority to:

1. **Nickname link** (`client_binance_nicknames`) — highest trust
2. **Verified name link** (`client_verified_names`) — KYC trust
3. **Single exact name match** — only if no nickname/verified-name candidate exists
4. **Multiple/ambiguous** → force manual selection with a warning banner showing each candidate's nickname so operator picks the right person

If steps 1–2 return a client whose name *differs* from the displayed name, show a "Linked by nickname — name on Binance differs" notice so operator confirms intentionally.

### E. Always show nickname on the approval table

Add a dedicated **"Binance ID / Nickname"** column to:

- Buyer Onboarding Approvals (already partially shown — make it primary, not derived)
- Seller Onboarding Approvals
- Terminal Sales Sync table (already shows nickname; add verified_name underneath)
- Terminal Purchase Sync table (mirror)

Each row shows: `@nickname` (mono) and below it `verified_name` if present. This is the user's "each order also carries the nickname while approval" requirement.

## Files involved

| File | Change |
|---|---|
| Migration: `client_onboarding_approvals`, `seller_onboarding_approvals` | Add `binance_nickname`, `verified_name` cols + backfill |
| Migration: trigger that inserts approval rows | Populate the two new fields |
| `src/components/clients/ClientOnboardingApprovals.tsx` | New 4-state badge logic, nickname column, "link nickname" action |
| `src/components/clients/SellerOnboardingApprovals.tsx` | Same as above |
| `src/components/sales/TerminalSalesApprovalDialog.tsx` | Reorder auto-match: nickname → verified name → name. Warn on cross-name link. |
| `src/components/purchase/TerminalPurchaseApprovalDialog.tsx` | Mirror the sales-side change |
| `src/lib/clientIdentityResolver.ts` | Add `resolveApprovalIdentityState()` for the 4-state classification (reuses existing hierarchy) |
| `src/components/sales/TerminalSalesSyncTab.tsx` + purchase twin | Show verified_name under nickname in the table |

## Out of scope / not changing

- Binance API contract — we only consume `counterparty_nickname` and `buyerRealName` / `sellerRealName` already fetched.
- No changes to KYC document flow or risk appetite logic.
- No deletion or merging of existing client records — the operator always confirms.

## Open question (one)

For the **`name_collision` → "This is actually {existing}"** action: should it require a Super Admin / specific permission to link a nickname to a different-named client, or is the regular client-approval permission enough? (Linking writes a nickname row that affects all future auto-matching.)

