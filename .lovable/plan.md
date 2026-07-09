
# Correction to Phase 4 Identity Sanitizer

## Verdict
Claude is right. Verified against the live database:
- `P2P-*` nicknames are a perfect 1:1 bijection with userNo (3,844 distinct, 0 collisions in either direction) — the most stable identifiers in the system.
- Rejecting them severs auto-linking for **3,824 counterparties / 6,053 orders (~19% of flow)**, dumping them into the manual mapping queue forever.
- Pure-digit rejection catches **0** of its intended target (bare userNo strings — none exist) and only hits ~20 legitimate phone-style nicknames.
- The real cause of bad merges was the **display-name string fallback**, which the name-match demotion already fixes.

## What to change (`src/lib/clientIdentityResolver.ts`)

### 1. Keep the name-match demotion (no change)
Bare display-name matches stay non-binding (`nameSuggestion`), still routed to manual confirmation. This is the fix that actually prevents distinct users sharing a name from merging. Leave it exactly as shipped.

### 2. Reverse the identity-lookup rejection in `sanitizeNickname`
- **Stop rejecting `P2P-*` for lookups.** They are stable, bijective identity strings — treat them as valid nickname keys for resolving/auto-linking a counterparty, exactly like custom nicknames.
- **Stop rejecting pure-digit / phone-style nicknames for lookups.** Data shows none of them equal their own userNo, so they are real handles, not placeholder noise.
- Keep rejecting only genuinely unstable/ambiguous inputs: empty strings and, if desired, a string that is *identical to the row's own `cp_userno`* (belt-and-suspenders — currently 0 rows, but cheap to guard).

### 3. Optional split (persist vs. lookup)
If we want to avoid proliferating new placeholder aliases on client records going forward:
- Allow `P2P-*` / digit nicks for **lookups** (resolution/auto-link) — always.
- Optionally gate only the **creation of a new `client_binance_nicknames` row** whose sole alias is a placeholder, when a stronger signal (userNo already linked) exists.
- Never block a lookup on these strings.

### 4. Leave existing data untouched
The 407 active `P2P-*` links on client records are stable and correct — do not strip or migrate them.

## Phase 3a governance (before any further de-merge runs)
Per Claude's ask, and sound practice:
- Produce a **written guard spec** first: explicit reversibility mapping (rollback batch id + affected rows) and a turnover-reconciliation check (per-userNo order count and value before/after must balance).
- The already-executed batch `e7d245ed-...` stays rollback-able via `phase3a_demerge_rollback`; no new de-merge batch runs until the spec is approved.
- The 7 interleaved custom-nickname userNos from the earlier audit remain **open** — they involve custom nicknames and still need the re-fetch stability test; they are not covered by this sanitizer change.

## Verification after implementation
1. Confirm `sanitizeNickname` returns a usable key for representative `P2P-*` and phone-style samples (unit-level check).
2. Re-run the sync/approval resolver against a set of P2P-only counterparties and confirm they auto-link to their existing client instead of routing to the manual queue.
3. Re-count the manual mapping queue to confirm the ~6,000-order backlog does not accumulate.
4. When a new Phase 3a batch is eventually approved, verify execution with per-userNo order-count and turnover reconciliation against the DB.

## Scope
Code-only change in the identity resolver; no schema migration, no bulk data rewrite. No behavior change to the name-match demotion (the actual merge-prevention fix stays intact).
