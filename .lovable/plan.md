
## Issue Found (Root Cause)

The save failure is caused by a **DB trigger/constraint mismatch** in terminal role permission audit logging:

- Table constraint on `public.terminal_permission_change_log.action` allows only:
  - `'grant'`, `'revoke'`
- Trigger function `public.log_terminal_permission_change()` currently writes:
  - `'granted'`, `'revoked'`

So when `save_terminal_role` updates permissions (delete + insert rows in `p2p_terminal_role_permissions`), the trigger inserts invalid action values and the transaction fails with:
`violates check constraint "terminal_permission_change_log_action_check"`.

This exactly matches your screenshot error.

---

## Fix Plan (No New Functionality)

### Step 1 — SQL migration: align trigger output with constraint
Update `public.log_terminal_permission_change()` to emit:
- `v_action := 'grant'` for INSERT
- `v_action := 'revoke'` for DELETE

No schema change needed; only function correction.

### Step 2 — Consistency safeguard for terminal save flow
In the same migration, keep existing trigger wiring (`trg_log_terminal_permission_change`) as-is, but ensure function is recreated with:
- `SECURITY DEFINER`
- `SET search_path TO 'public'`
to preserve security hygiene and deterministic behavior.

### Step 3 — Verify end-to-end after migration
Validate the exact failing flow:
1. Open Terminal → Users & Roles
2. Edit a role (e.g., Payer)
3. Toggle permissions and save
4. Confirm no 400 error and save succeeds
5. Confirm rows appear in `terminal_permission_change_log` with only `grant/revoke`

---

## Technical Notes

- `save_terminal_role` itself is now correctly deployed (admin bypass + hierarchy escalation guard are present).
- The blocker is downstream trigger logging, not role save permission checks.
- This is a data-integrity bug fix only (no new feature/UI behavior changes).
