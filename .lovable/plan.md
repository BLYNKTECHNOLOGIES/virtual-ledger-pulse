

# Phase 27: Terminal RBAC — Database-Level RLS Enforcement

## Problem

All terminal tables have open `authenticated_all_*` RLS policies (`USING condition: true`). Any authenticated ERP user (HR, accounting, etc.) can directly query terminal tables via the Supabase API, bypassing the 53-permission RBAC system which is enforced only at the UI layer and in select RPC functions.

## Approach

**Tiered enforcement strategy:**
- **READ access**: Require `verify_terminal_access(auth.uid())` — user must have at least one terminal role OR be Super Admin. This prevents non-terminal users from seeing terminal data.
- **WRITE access on sensitive tables**: Require specific `has_terminal_permission()` checks for high-risk mutations (role assignments, bypass codes, payer config).
- **Service role**: Keep unrestricted for cron jobs, triggers, and system operations.

This is deliberately not per-table-per-permission granular at the RLS level because:
1. The application layer + RPC guards already enforce per-module permissions
2. Per-permission RLS on 20+ tables risks breaking legitimate queries and adds significant query overhead
3. The critical security gap is non-terminal users accessing terminal data at all

## Tables to Harden (14 terminal tables)

### Tier 1 — High sensitivity (permission-gated writes)

| Table | READ gate | WRITE gate |
|-------|-----------|------------|
| `p2p_terminal_roles` | `verify_terminal_access` | `has_terminal_permission('terminal_users_manage')` |
| `p2p_terminal_role_permissions` | `verify_terminal_access` | `has_terminal_permission('terminal_users_manage')` |
| `p2p_terminal_user_roles` | `verify_terminal_access` | `has_terminal_permission('terminal_users_role_assign')` |
| `terminal_bypass_codes` | `verify_terminal_access` | `has_terminal_permission('terminal_users_bypass_code')` |

### Tier 2 — Standard terminal tables (terminal-access-gated)

| Table | READ + WRITE gate |
|-------|-------------------|
| `terminal_order_assignments` | `verify_terminal_access` |
| `p2p_order_chats` | `verify_terminal_access` |
| `terminal_payer_assignments` | `verify_terminal_access` |
| `terminal_mpi_snapshots` | `verify_terminal_access` |
| `terminal_shift_reconciliations` | `verify_terminal_access` |
| `terminal_operator_assignments` | `verify_terminal_access` |
| `terminal_notifications` | `verify_terminal_access` |
| `terminal_user_presence` | `verify_terminal_access` |
| `terminal_permission_change_log` | `verify_terminal_access` |
| `terminal_assignment_audit_logs` | `verify_terminal_access` |

### Not changed
- `terminal_biometric_sessions`, `terminal_internal_messages`, `terminal_internal_chat_reads`, `terminal_auto_reply_exclusions`, `terminal_payer_order_log` — these will also get `verify_terminal_access` gating.
- `terminal_alternate_upi_requests` — already has specific SELECT/UPDATE policies, will add terminal access check.

## Migration SQL Pattern

```sql
-- Drop open policy
DROP POLICY IF EXISTS "authenticated_all_terminal_order_assignments" ON terminal_order_assignments;

-- Terminal users: read
CREATE POLICY "terminal_users_select" ON terminal_order_assignments
  FOR SELECT TO authenticated
  USING (verify_terminal_access(auth.uid()));

-- Terminal users: write  
CREATE POLICY "terminal_users_write" ON terminal_order_assignments
  FOR ALL TO authenticated
  USING (verify_terminal_access(auth.uid()))
  WITH CHECK (verify_terminal_access(auth.uid()));

-- System operations
CREATE POLICY "service_all" ON terminal_order_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

For Tier 1 tables, write policies use `has_terminal_permission()` instead of `verify_terminal_access()`.

## Safety

- `verify_terminal_access()` and `has_terminal_permission()` are both `SECURITY DEFINER` with `SET search_path = public` — they bypass RLS on the tables they query, preventing infinite recursion.
- Service role policies ensure cron jobs and triggers continue working.
- All existing RPC functions that modify terminal data are `SECURITY DEFINER`, so they bypass RLS entirely — no breakage.

## Implementation

**1 migration file** containing:
- Drop 19 open `authenticated_all_*` policies on terminal tables
- Create ~38 replacement policies (SELECT + write per table, plus service_role)
- No frontend changes needed

## Summary

| Action | Count |
|--------|-------|
| Policies dropped | ~19 |
| Policies created | ~57 (SELECT + INSERT/UPDATE/DELETE + service_role per table) |
| Tables hardened | 19 |
| Frontend changes | 0 |

