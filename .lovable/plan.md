

# Implementation Plan: GAPs 1, 3, 8, 9, 10

## Scope Summary
5 gaps to close across DB triggers, page-level permission gating, data scope filtering, role comparison UI, and role template presets.

---

## GAP 1: Audit Trigger on Permission Changes

**Problem:** `terminal_permission_change_log` table exists but nothing populates it.

**Implementation:**
- Create SQL migration with a trigger function `log_terminal_permission_change()` on `p2p_terminal_role_permissions` table
- Fires on INSERT and DELETE, logs `role_id`, `role_name` (looked up from `p2p_terminal_roles`), `action` ('granted'/'revoked'), `permission`, `changed_by` (from `auth.uid()`)
- Update `save_terminal_role` RPC to use diff-based approach: compute added/removed permissions instead of delete-all + re-insert (preserves trigger granularity)

**Files:** 1 SQL migration

---

## GAP 3: Page-Level Granular Permission Gating

**Problem:** All terminal pages show all buttons/actions regardless of user permissions. The 50-permission system is cosmetic.

**Implementation per page:**

### Orders Page (`TerminalOrders.tsx`)
- Add `useTerminalAuth` permission checks for:
  - Chat button → `terminal_orders_chat`
  - Escalate action → `terminal_orders_escalate`
  - Assignment dialog → `terminal_orders_manage`
  - Export (if present) → `terminal_orders_export`
- Wrap `OrderActions.tsx` buttons with permission checks passed as props

### Automation Page (`TerminalAutomation.tsx`)
- Wrap entire page with `TerminalPermissionGate` using `terminal_pricing_view` (already done in sidebar, but page itself has no gate)
- Auto-Reply tab: 
  - "New Rule" button → `terminal_autoreply_manage`
  - Toggle switch → `terminal_autoreply_toggle`
  - Delete button → `terminal_destructive`
- Auto-Pay tab → `terminal_autopay_view` to see, toggle → `terminal_autopay_toggle`, configure → `terminal_autopay_configure`
- Auto Pricing/Hybrid tabs → `terminal_pricing_view` to see, create/edit → `terminal_pricing_manage`, toggle → `terminal_pricing_toggle`, delete → `terminal_pricing_delete`

### Users Page (`TerminalUsers.tsx`)
- "Roles" tab visibility → `terminal_users_role_assign`
- Bypass code generation → `terminal_users_bypass_code`
- Role assignment dropdown in user list → `terminal_users_role_assign`

### Dashboard Page (`TerminalDashboard.tsx`)
- Export/sync buttons → `terminal_dashboard_export`

### Assets Page (`TerminalAssets.tsx`)
- Already partially gated (spot trading). No additional changes needed.

### MPI Page (`TerminalMPI.tsx`)
- Already uses `visibleUserIds` from jurisdiction — needs permission-based scope override (see GAP 8)

### Payer Page (`TerminalPayer.tsx`)
- Already gated at page level with `terminal_payer_view`
- Lock/Pay/Release actions inside → `terminal_payer_manage`

### Settings Page (`TerminalSettings.tsx`)
- Already gated. Manage actions → `terminal_settings_manage`

### Audit Logs Page (`TerminalAuditLogs.tsx`)
- Already properly gated

**Approach:** Use `hasPermission()` inline checks to conditionally render buttons. For heavier sections, use `TerminalPermissionGate` with `silent` prop. Pass permission booleans as props to child components where needed.

**Files:** `TerminalOrders.tsx`, `TerminalAutomation.tsx`, `TerminalUsers.tsx`, `TerminalDashboard.tsx`, `TerminalPayer.tsx`, `OrderActions.tsx`, `TerminalMPI.tsx`

---

## GAP 8: Data Scope Filtering (own vs all)

**Problem:** `terminal_mpi_view_own` vs `terminal_mpi_view_all` and `terminal_users_manage_subordinates` vs `terminal_users_manage_all` exist in DB but no code filters data based on them.

**Implementation:**

### MPI Page (`TerminalMPI.tsx`)
- Check `hasPermission('terminal_mpi_view_all')` — if true, show all users (current behavior)
- If only `terminal_mpi_view_own` — filter metrics to show ONLY the current user's data
- Hide the "View Level" dropdown (all/operators/payers) when user only has `view_own`

### Users Page (`TerminalUsersList.tsx`)
- If `terminal_users_manage_all` — show all terminal users (current behavior)
- If only `terminal_users_manage_subordinates` — filter user list to show only users whose supervisor includes the current user (use existing `supervisorNames` field or hierarchy level comparison)
- If neither manage permission — hide edit/config buttons, show read-only list

**Files:** `TerminalMPI.tsx`, `TerminalUsersList.tsx`

---

## GAP 9: Role Comparison Side-by-Side View

**Problem:** No way to compare two roles' permissions visually.

**Implementation:**
- Add a "Compare" button to the `TerminalRolesList.tsx` header (next to "New Role")
- Opens a dialog with two role dropdowns (Role A / Role B)
- Below the selectors, render the same `PERMISSION_MODULES` grid but with 3 columns per permission: Label | Role A | Role B
- Color-highlight differences:
  - Green row = both have it
  - Red/amber = only one has it (show which)
- Counter at top: "Role A: 25 perms | Role B: 18 perms | Shared: 15 | Diff: 13"

**Files:** New component `TerminalRoleComparison.tsx` + update `TerminalRolesList.tsx` to add the Compare button/dialog

---

## GAP 10: Role Template Presets

**Problem:** Creating a new role requires manually toggling 50 permissions.

**Implementation:**
- Add a "From Template" dropdown button next to the permission counter in the role create/edit dialog
- Templates are hardcoded constants matching the tier definitions from Stage 2:
  - "Operator Template" (~14 perms): views + escalate + chat
  - "Team Lead Template" (~25 perms): operator + manage subordinates + some manage perms
  - "Payer Template" (~10 perms): payer_view + payer_manage + orders_view
  - "Asst Manager Template" (~31 perms)
  - "Ops Manager Template" (~37 perms)
- Clicking a template replaces current `editPerms` set with the template's permission set (only permissions the current user possesses are actually applied — delegation guard)
- Show confirmation toast: "Applied Operator template (14 permissions)"

**Files:** `TerminalRolesList.tsx` (add `ROLE_TEMPLATES` constant + template selector dropdown)

---

## Execution Order

1. **SQL Migration** — Audit trigger (GAP 1)
2. **TerminalRolesList.tsx** — Role comparison + templates (GAPs 9, 10)
3. **Page-level gating** — All terminal pages (GAP 3)
4. **Data scope filtering** — MPI + Users list (GAP 8)

## Estimated File Changes
- 1 new SQL migration
- 1 new component (`TerminalRoleComparison.tsx`)
- ~8 existing files modified

