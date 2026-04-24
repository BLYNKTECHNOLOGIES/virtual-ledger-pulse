

## Issue: "Duplicate Entry" Error on Small Sales Approval — Root Cause Identified

### What's actually happening

The "Duplicate Entry" toast in the Small Sales Bulk Approval dialog is **misleading**. The batch you tried to approve (`94.66 USDT / ₹9,800`) is genuinely still `pending_approval` in the database — nothing was duplicated. The real DB error being thrown is something completely different, and the frontend error parser is mis-classifying it.

### Root Cause (two separate, compounding bugs)

**Bug 1 — Broken `ON CONFLICT` clause on `terminal_payer_order_locks`** (the actual blocker)

Postgres logs show dozens of identical errors:

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
INSERT INTO terminal_payer_order_locks (order_number, payer_user_id, status)
... ON CONFLICT (order_number) DO NOTHING
```

The table has only a **partial** unique index:

```sql
CREATE UNIQUE INDEX idx_payer_order_locks_unique_locked
  ON terminal_payer_order_locks (order_number)
  WHERE (status = 'locked');
```

But the client-side insert uses `ON CONFLICT (order_number)` with no `WHERE` predicate, and inserts `status = 'active'` (not `'locked'`). Postgres requires a matching full unique constraint OR a partial index whose predicate matches the insert — neither exists. Every insert raises `42P10`.

Worse, the `status` CHECK constraint only allows `('active','completed','released')` — `'locked'` isn't even a valid status, so the partial index can never match anything. The index is dead code.

This insert fires in the background whenever a terminal user opens an order (likely a payer-claim lock). It returns a 4xx that bubbles up into the same React Query error channel the approval dialog reads from, OR it's being thrown synchronously from inside a trigger/edge function called during approval.

**Bug 2 — Frontend error parser too greedy**

`src/utils/approvalErrorParser.ts` line 99:

```ts
if (lowerMsg.includes('duplicate') || lowerMsg.includes('already exists')
 || lowerMsg.includes('unique constraint') || lowerMsg.includes('duplicate key')) {
  return { title: 'Duplicate Entry', description: '...already been approved...' };
}
```

The Postgres message `"there is no unique or exclusion constraint..."` contains the substring `"unique constraint"`, so the parser falsely reports "Duplicate Entry — already approved" even though it's a schema-design error, not a duplicate.

### Fix Plan

**Step 1 — Fix the schema (migration)**

Replace the broken partial index + insert pattern with a coherent design. Two acceptable shapes; I'll go with (A) because it matches the existing CHECK constraint and current insert payload:

(A) Add a real partial unique index whose predicate matches **active** (the status the client actually inserts):

```sql
DROP INDEX IF EXISTS idx_payer_order_locks_unique_locked;

CREATE UNIQUE INDEX idx_payer_order_locks_unique_active
  ON terminal_payer_order_locks (order_number)
  WHERE status = 'active';
```

Then update every `ON CONFLICT (order_number)` call site to use the matching predicate form:
```ts
.upsert({...}, { onConflict: 'order_number', ignoreDuplicates: true })
```
must be rewritten as a guarded insert (PostgREST cannot target a partial index), e.g. an `insert().select()` wrapped in a try/catch that swallows `23505` (unique violation) — the standard pattern used elsewhere in the codebase per `mem://constraints/double-reversal-prevention-system-wide`.

**Step 2 — Tighten the error parser**

In `parseApprovalError`, exclude the false-positive phrase before the duplicate branch:

```ts
const isFalseDuplicate = lowerMsg.includes('no unique or exclusion constraint');
if (!isFalseDuplicate && (lowerMsg.includes('duplicate') || ...)) { ... }
```

Add a dedicated branch for schema/ON CONFLICT misconfiguration so future occurrences surface as a real "System Configuration Issue" instead of confusing operators.

**Step 3 — Audit other `ON CONFLICT` call sites**

Grep the codebase for `onConflict:` and `ON CONFLICT (` and verify each one targets a real, full (or matching-predicate) unique index. Likely candidates to recheck: `pending_settlements`, `wallet_transactions`, `sales_order_payment_splits`, idempotency-guard inserts.

**Step 4 — Verify the small sales approval succeeds end-to-end**

After Steps 1–2, retry approving the same `94.66 USDT` batch. Expected outcome: sales order created, wallet deducted, `pending_settlements` row written for the PAYTM-AS-POS gateway leg, batch marked `approved`. Per `mem://features/erp/small-order-sync-logic` and the existing reversal RPC, no other side-effects need new code.

### Files to Change

1. **New migration** — drop broken partial index, add corrected one on `terminal_payer_order_locks`.
2. `src/utils/approvalErrorParser.ts` — exclude false-positive phrase, add real "schema/ON CONFLICT" branch.
3. Any TS file that calls `terminal_payer_order_locks` upsert with `onConflict: 'order_number'` — convert to guarded insert (will identify exact files via `code--search_files` once you approve).
4. Audit pass on other `onConflict:` usages — fix any other partial-index mismatches found.

### What I Will NOT Touch

- The `SmallSalesApprovalDialog` itself — its logic is correct; it was the victim, not the cause.
- Existing pending small sales batches — they remain valid and will approve cleanly once the schema is fixed.
- `delete_sales_order_with_reversal` — already handles split bank legs, settlements, wallet ledger, and cascades correctly per prior verification.

### Approve to proceed
Approval switches me to default mode where I will: write the migration, patch the error parser, locate and fix every broken `ON CONFLICT` insert, and confirm one of the pending USDT batches approves cleanly.

