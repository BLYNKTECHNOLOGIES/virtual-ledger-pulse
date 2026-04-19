

## Root Cause — Confirmed via DB

DB query results for "Arnab Jyoti Das":

**`client_verified_names`:**
```
verified_name: "Arnab Jyoti Das"
client_id:     36f39e6e-c90f-4543-8544-01c62303de60
source:        approval
→ that client_id maps to a clients row named "Arnab Jyoti Das"
   with buyer_approval_status = PENDING (created today, 2026-04-19)
```

So the pending row in the queue and the verified-name link **both point to the same PENDING stub client** — that is why the Directory search returns zero results (Directory only shows APPROVED clients) yet the badge fires.

There are only two clients in the DB with similar names:
1. `36f39e6e…` "Arnab Jyoti Das" — **PENDING buyer** (the stub itself, hidden from Directory)
2. `87f1b7e2…` "Pranab Jyoti Das" — APPROVED seller (different first name, NOT the cause)

There is NO real cross-contamination this time. This is a **self-match / backlog-echo bug** on the verified-name lookup, exactly like the ones we previously fixed for nickname and display-name lookups in `ClientOnboardingApprovals.tsx`.

## Why the existing guards missed it

In `src/components/clients/ClientOnboardingApprovals.tsx` lines 270-358 we already have:

- `selfClientIds` filter on `nickname → client` lookup (line 293) ✅
- `selfClientIds` filter on `verified_name → client` lookup (line 308) ✅
- `selfClientIds` + PENDING-only filter on `display_name → client` lookup (lines 351-357) ✅

But the verified-name path **only filters `selfClientIds`** — it does NOT filter out other PENDING-only stubs the way the display-name path does. Worse, here the row's *own* `resolved_client_id` is being matched: `36f39e6e…` IS in the pending queue, so it should already be in `selfClientIds`.

That means one of two things is happening:
- **(most likely)** The pending approval row for Arnab Jyoti Das has `resolved_client_id = NULL` (the stub client `36f39e6e…` was created by an earlier sync and never written back to the approval row), so `selfClientIds` does not contain `36f39e6e…`, so the verified-name lookup happily returns it.
- The same fix we applied to the display-name path needs to be applied to the verified-name path: skip clients that are PENDING/NOT_APPLICABLE on both sides.

Either way, the fix is the same.

## Fix

In `src/components/clients/ClientOnboardingApprovals.tsx`, mirror the display-name PENDING-stub guard onto the verified-name lookup:

```ts
for (const r of vnRows) {
  const cl = clientById.get(r.client_id);
  if (!cl) continue;
  // Skip PENDING-only stubs — same logic as displayNameToClient.
  const buyerPending  = !cl.buyer_approval_status  || cl.buyer_approval_status  === 'PENDING' || cl.buyer_approval_status  === 'NOT_APPLICABLE';
  const sellerPending = !cl.seller_approval_status || cl.seller_approval_status === 'PENDING' || cl.seller_approval_status === 'NOT_APPLICABLE';
  if (buyerPending && sellerPending) continue;
  verifiedNameToClient.set(r.verified_name, cl);
}
```

Apply the **same change** in `src/components/clients/SellerOnboardingApprovals.tsx` (it has the equivalent block).

Optionally tighten the nickname loop the same way for symmetry — a nickname linked to a client that is PENDING on every side is also a backlog echo, not a "Known Client".

## DB cleanup (one-time)

The stub row in `client_verified_names` (id `ad950304…`) for Arnab pointing to its own pending client is harmless after the UI guard, but it should be deleted because verified-name links should never auto-attach to a pending client — that was the contract introduced in the previous "approval correlation check" migration. Sweep:

```sql
DELETE FROM public.client_verified_names cvn
USING public.clients c
WHERE cvn.client_id = c.id
  AND (c.buyer_approval_status  IN ('PENDING','NOT_APPLICABLE') OR c.buyer_approval_status  IS NULL)
  AND (c.seller_approval_status IN ('PENDING','NOT_APPLICABLE') OR c.seller_approval_status IS NULL);

DELETE FROM public.client_binance_nicknames cbn
USING public.clients c
WHERE cbn.client_id = c.id
  AND (c.buyer_approval_status  IN ('PENDING','NOT_APPLICABLE') OR c.buyer_approval_status  IS NULL)
  AND (c.seller_approval_status IN ('PENDING','NOT_APPLICABLE') OR c.seller_approval_status IS NULL);
```

(These mirror the rule already enforced in the sync hooks: never auto-link identity to a non-approved client.)

## Files to change

- `src/components/clients/ClientOnboardingApprovals.tsx` — add PENDING-stub guard to verified-name (and nickname) lookups
- `src/components/clients/SellerOnboardingApprovals.tsx` — same
- New migration `supabase/migrations/<ts>_purge_pending_stub_identity_links.sql` — one-time DELETE of stub-only rows in `client_verified_names` and `client_binance_nicknames`

## Result

- "Arnab Jyoti Das" pending row → tag becomes **"New Client"**.
- No future PENDING stub can produce false "Same KYC name" / "Known Client" badges, regardless of whether the approval row's `resolved_client_id` was written back or not.

Reply **approved** to execute.

