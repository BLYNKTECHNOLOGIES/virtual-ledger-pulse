# Phase 3a De-Merge — Guard Spec + P2P Auto-Link Verification

## Part 1 — P2P auto-linking verification (DONE, read-only)

Ran the real resolver (`src/lib/clientIdentityResolver.ts`) end-to-end against representative inputs:

```text
sanitizeNickname:
  "P2P-abc12345"   -> "P2P-abc12345"   (accepted)
  "918888888888"   -> "918888888888"   (accepted, phone-style)
  "User-1234"      -> "User-1234"      (accepted)
  "Kaustubh"       -> "Kaustubh"       (accepted)
  "ram*** "        -> null             (rejected — masked)
  "Unknown"        -> null             (rejected)
  "" / null        -> null             (rejected)

resolveClientId (P2P nickname already linked) -> { clientId: client-777, resolvedVia: "nickname" }
resolveClientId (name-only match)             -> { clientId: null,       resolvedVia: null }  ← routed to manual queue
```

Database backs this: 407 active `P2P-*` nickname links exist and each is 1:1 with a userNo (2,957 total active links). The resolver map is built from `client_binance_nicknames` (which includes P2P rows), so P2P counterparties auto-link instead of falling into the manual queue. Name-only matches still return null — the merge-prevention fix stays intact. **No code change needed; behavior is correct.**

## Part 2 — Phase 3a Guard Spec (written, to satisfy the "spec before any further run" requirement)

Current state:
- One batch already executed: `e7d245ed-296a-445d-a547-3e0ba8b81720` (11 clients created, 9 POs moved, 1 nickname moved, 65 same-identity skips, 2 name-collision skips) — fully rollback-able, 0 rows reverted.
- Audit report totals now: 79 `SPLIT`, 702 `UNRESOLVED`, 2,172 `ANCHOR`.

### 2.1 Preconditions (must all pass before any new batch)
1. No un-reverted prior batch is in an inconsistent state (`client_demerge_rollback_log` reconciles to actual `client_id` values).
2. Candidate set is frozen: snapshot the exact `SPLIT` rows (client_uuid, resolved_userno, verified_name) that the batch will touch into a pre-run manifest.
3. `resolved_userno <> anchor_userno` and verified_name present — rows without a verified name are skipped (never guessed).

### 2.2 Reversibility mapping (already enforced, formalized here)
- Every mutation writes a `client_demerge_rollback_log` row keyed by `batch_id` with `entity_type`, `entity_ref` (order_number / nickname / client id), `old_client_id`, `new_client_id`, `old_value`, `new_value`.
- Rollback path: `SELECT phase3a_demerge_rollback('<batch_id>')` restores every `sales_orders`/`purchase_orders`/`client_binance_nicknames` row to `old_value`/`old_client_id` and marks `reverted=true`.
- Acceptance: after a dry-run mental pass, count of mutation log rows must equal `sales_moved + purchases_moved + nicknames_moved + clients_created`.

### 2.3 Turnover / order-count reconciliation (the new hard gate)
For each `resolved_userno` in the batch, capture BEFORE and AFTER:

```text
per-userNo:
  sales_order_count, sales_turnover  (sum of order value)
  purchase_order_count, purchase_turnover
```

Invariants that MUST hold (else abort/rollback):
1. **Conservation:** for each userNo, `orders(before) == orders(after)` and `turnover(before) == turnover(after within 0.01 tolerance)` — the split only re-attributes ownership, never creates or drops volume.
2. **Global balance:** `Σ turnover across (parent + all new clients) after == parent turnover before` per userNo group.
3. **No orphans:** every re-attributed order points to a live, non-deleted client after the run.
4. **Name-collision safety:** any `resolved_userno` whose verified_name equals an existing different client is logged as `skipped_name_collision` and left for manual review (never auto-merged).

### 2.4 Execution protocol
1. Write pre-run manifest + BEFORE reconciliation snapshot to a log table / export.
2. Run `phase3a_demerge()` (single transaction, SECURITY DEFINER).
3. Capture AFTER snapshot; compute deltas.
4. If any invariant in 2.3 fails → immediately `phase3a_demerge_rollback(batch_id)` and report.
5. If all pass → report per-userNo before/after table for sign-off.

### 2.5 Out of scope for this batch
- The ~702 `UNRESOLVED` rows and 7 interleaved custom-nickname userNos: require the re-fetch stability test first; not touched here.

## Deliverable of the build step
- A read-only reconciliation script/query pair (BEFORE/AFTER per-userNo order-count + turnover) wrapping the existing `phase3a_demerge` / `phase3a_demerge_rollback` functions.
- No new schema, no resolver change. Execution of an actual new de-merge batch happens only after you approve the reconciliation output.
