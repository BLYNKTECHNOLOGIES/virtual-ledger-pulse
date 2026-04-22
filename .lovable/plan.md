

## Goal

Eliminate the 314 pre-existing Supabase linter warnings as a dedicated cleanup pass. These are technical debt, not active vulnerabilities — but closing them removes noise so future real issues stand out, and removes a latent privilege-escalation surface on legacy `SECURITY DEFINER` functions.

## Scope

Two warning categories, both pre-existing (not introduced by the immutable-ledger work):

1. **`function_search_path_mutable`** — ~310 legacy functions missing `SET search_path = public`.
2. **`rls_enabled_no_policy`** — 4 tables with RLS on but no policies defined.

## Part 1 — Pin `search_path` on every legacy function

**What it fixes:** A `SECURITY DEFINER` function without a pinned `search_path` resolves table names via the *caller's* `search_path`. If anyone could plant a same-named object in an earlier-resolved schema, the function would read/write the wrong table — privilege escalation. Risk in our environment is low (only owners can create schemas), but pinning is the documented Postgres + Supabase best practice and removes the surface entirely.

**Approach:**
- Run the linter to get the full, current list of offending functions (the count and signatures may have shifted since "314").
- Generate one migration that issues `ALTER FUNCTION public.<name>(<args>) SET search_path = public` for every function flagged.
- This is a metadata-only change — no behavior change, no data touched, no risk of regression. Safe to run in a single migration.
- Skip any function already pinned (idempotent — `ALTER ... SET` just overwrites).
- Functions in non-`public` schemas (if any) are excluded from this pass and called out separately.

## Part 2 — Resolve the 4 `rls_enabled_no_policy` tables

**What it means:** RLS is on, no policies exist → table is effectively locked to everyone except the service role / superuser. Not a security hole (failure mode is over-restrictive, not over-permissive), but it's either an intentional service-role-only table or a forgotten policy that's silently breaking a feature.

**Approach for each of the 4:**
1. Identify the table via the linter.
2. Inspect schema + check whether any app code reads/writes it via the `authenticated` role.
3. Classify as either:
   - **Service-role-only (intentional)** → add a single explicit `DENY` / no-op policy with a SQL comment documenting the intent so the linter is satisfied and future readers understand.
   - **Forgotten policy** → add the correct `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies matching the table's usage (typically `auth.uid() = user_id` or `has_role(auth.uid(), 'admin')`).
4. Decision per table will be presented inline in the migration with a comment explaining the choice.

## Part 3 — Verification

1. Re-run `supabase--linter` after the migration.
2. Expected outcome: both warning categories drop to zero (or to a tiny residual that's documented).
3. No app behavior change expected — the only functional change is on the 4 RLS tables, and only if any were "forgotten policy" (in which case the feature using them starts working again).

## Out of scope

- Re-auditing functions that *already* have `SET search_path = public` (no-op).
- Touching functions in `auth`, `storage`, `realtime`, `supabase_functions`, `vault` schemas (Supabase-reserved, must not modify).
- Any logic changes inside the legacy functions — this pass is purely the `search_path` pin and policy additions.

## Deliverable

One migration file: `cleanup_search_path_and_rls_policies.sql` containing:
- Bulk `ALTER FUNCTION ... SET search_path = public` statements (one per flagged function, with a header comment listing the count).
- Per-table RLS policy additions for the 4 tables, each with an inline comment explaining the classification.

