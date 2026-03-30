

# Terminal Bug Audit — Round 4

## Bugs Found

### BUG 1 (CRITICAL): `save_terminal_role` Delegation Guard Mismatch — Admins Can't Save Roles

**Root cause**: The `get_terminal_permissions` RPC returns ALL permissions for users with `hierarchy_level <= 0` (Admin, Super Admin). The frontend correctly shows these users can toggle any permission. However, `save_terminal_role`'s delegation guard checks the caller's permissions from `p2p_terminal_role_permissions` directly — which only stores the specific permissions assigned to the role.

The Admin role (level 0) has 53 of 55 permissions stored in DB. It's missing `terminal_pricing_delete` and `terminal_mpi_view_own`. When an Admin tries to save a role containing either of these permissions, the delegation guard raises: "Cannot grant permissions you do not have."

The guard bypass condition is `v_caller_level < 0` (strictly negative), but `get_terminal_permissions` uses `hierarchy_level <= 0` (includes 0). This inconsistency is the root cause.

**Fix**: Change the delegation guard bypass in `save_terminal_role` from `IF v_caller_level >= 0` to `IF v_caller_level > 0`, making it consistent with `get_terminal_permissions`. This means users with hierarchy_level 0 (Admin) bypass the delegation guard, matching the permissions they actually see in the UI.

### BUG 2 (HIGH): Missing Permission Gates on 3 Pages

| Page | File | Missing Gate |
|------|------|-------------|
| Orders | `TerminalOrders.tsx` | `terminal_orders_view` |
| Ads Manager | `AdManager.tsx` (via TerminalAdManager) | `terminal_ads_view` |
| Operator Detail | `TerminalOperatorDetail.tsx` | `terminal_mpi_view_own` |

These pages can be accessed via direct URL regardless of permissions. The sidebar filters them, but URL bypass works.

**Fix**: Wrap each page's content in `<TerminalPermissionGate>` with the appropriate permission. For AdManager (which is shared between ERP and Terminal), create a wrapper in `TerminalAdManager.tsx` instead of a bare re-export.

### BUG 3 (MEDIUM): `save_terminal_role` Hierarchy Escalation

When editing an existing role, the hierarchy guard checks the role's CURRENT hierarchy level, not the NEW one being set via `p_hierarchy_level`. A user at level 3 could edit a level-5 role (allowed) and change it to level 2 (above their own), escalating the role's authority.

**Fix**: After determining `v_target_level` from the existing role, also check `COALESCE(p_hierarchy_level, v_target_level)` against the caller's level to prevent hierarchy escalation.

---

## Implementation Plan

### Step 1: Fix `save_terminal_role` (SQL Migration)

1. Change delegation guard bypass from `v_caller_level >= 0` to `v_caller_level > 0` so Admin-level users bypass the guard (matching `get_terminal_permissions` behavior)
2. Add hierarchy escalation guard: check the NEW hierarchy level (`p_hierarchy_level`) against the caller's level when editing existing roles

### Step 2: Add Permission Gates to 3 Pages

- **`TerminalOrders.tsx`**: Import and wrap with `<TerminalPermissionGate permissions={['terminal_orders_view']}>`
- **`TerminalAdManager.tsx`**: Replace bare re-export with a component that imports AdManager and wraps it with `<TerminalPermissionGate permissions={['terminal_ads_view']}>`
- **`TerminalOperatorDetail.tsx`**: Import and wrap with `<TerminalPermissionGate permissions={['terminal_mpi_view_own']}>`

---

## Summary

- 1 SQL migration (fixes save failure + hierarchy escalation)
- 3 frontend file edits (permission gates)
- No new functionality
- Root cause of "can't save" is the Admin-level delegation guard inconsistency

