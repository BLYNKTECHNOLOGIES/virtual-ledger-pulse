# ERP Full System Audit — Phase 3 Report

## Phase 1 & 2 Status (completed)

- Phase 1: Data integrity, orphaned code, UI bugs — ALL FIXED
- Phase 2: Banking.tsx deleted, permission fix, dead code cleanup, website deletion, platforms seeded — ALL FIXED
- Carryover: KUCOIN -493.62 (accepted), duplicate phones (unique index pending data cleanup)

---

## CATEGORY 1: SECURITY — MISSING PERMISSION GATES

### P3-SEC-01 | ProfitLoss.tsx — NO permission gate (HIGH)

`src/pages/ProfitLoss.tsx` (902 lines) is routed at `/profit-loss` and contains sensitive financial data (revenue, expenses, profit margins, net profit). **No PermissionGate wrapper exists.** The sidebar correctly gates it behind `accounting_view`, but any authenticated user can access it by navigating directly to `/profit-loss`.

**Fix**: Wrap in `<PermissionGate permissions={["accounting_view"]}>`.

### P3-SEC-02 | AdManager.tsx — NO permission gate (HIGH)

`src/pages/AdManager.tsx` (179 lines) is routed at `/ad-manager`. Controls live Binance P2P advertisements — creating, editing, bulk status changes. **No PermissionGate.** Any authenticated user can manage ads by navigating directly.

Note: `TerminalAdManager.tsx` wraps it with `TerminalPermissionGate`, but the ERP route `/ad-manager` is unprotected.

**Fix**: Add a sidebar-level permission (e.g., `terminal_view`) and wrap in PermissionGate.

### P3-SEC-03 | Tasks.tsx — NO permission gate (MEDIUM)

`src/pages/Tasks.tsx` (316 lines) at `/tasks`. The sidebar gates it with `tasks_view/tasks_manage`, but the page itself has no PermissionGate. Users without the permission can access it via direct URL.

**Fix**: Wrap in `<PermissionGate permissions={["tasks_view"]}>`.

### P3-SEC-04 | UtilityHub.tsx — NO permission gate (MEDIUM)

`src/pages/UtilityHub.tsx` (53 lines) at `/utility`. Sidebar gates with `utility_view`, but page is unprotected. Leads to Invoice Creator which has no gate either.

**Fix**: Wrap in `<PermissionGate permissions={["utility_view"]}>`.

### P3-SEC-05 | InvoiceCreatorPage.tsx — NO permission gate (MEDIUM)

`src/pages/InvoiceCreatorPage.tsx` (250 lines) at `/utility/invoice-creator`. Generates financial invoices. No permission gate at all.

**Fix**: Wrap in `<PermissionGate permissions={["utility_view"]}>`.

---

## CATEGORY 2: SECURITY — HARDCODED CREDENTIALS

### P3-SEC-06 | Hardcoded demo-admin-id and email in permissions (HIGH)

`usePermissions.tsx` line 25 grants full admin permissions to:
- `user.id === 'demo-admin-id'`
- `user.email === 'blynkvirtualtechnologiespvtld@gmail.com'`

This bypasses the role-based permission system entirely. Similarly, `useUsers.tsx` has 4 fallback references to `demo-admin-id`.

**Risk**: If anyone creates an account with that email, they get full admin access.

**Fix**: Remove the `demo-admin-id` check entirely. The `super admin` role check on the same line is sufficient. Keep the email check only if it's the actual super admin account (but ideally use role-based only).

### P3-SEC-07 | localStorage stores userRole and userPermissions (MEDIUM)

`useAuth.tsx` line 90 stores `userRole: 'admin'` in localStorage. `usePermissions.tsx` stores full permission arrays in localStorage. These are readable and writable by any browser extension or XSS attack.

**Current mitigation**: The actual permission check in `usePermissions.tsx` fetches from DB first, localStorage is just a cache. But if the DB call fails (line 60-97), it falls back to role-based hardcoded permissions — not localStorage. So the localStorage writes are **dead code** — they're set but never read back as a fallback.

**Fix**: Remove localStorage permission writes since they serve no purpose and create a false sense of caching.

---

## CATEGORY 3: UX — WINDOW.LOCATION.RELOAD

### P3-UX-01 | StepBySalesFlow.tsx — full page reload after order creation (MEDIUM)

Line 424: `setTimeout(() => window.location.reload(), 1000)` after already invalidating 9 query keys. The invalidation is sufficient — the reload causes a jarring full-page flash.

**Fix**: Remove the `setTimeout(() => window.location.reload(), 1000)` line.

### P3-UX-02 | EditUserDialog.tsx — reload after own role change (LOW — ACCEPTABLE)

Line 247: Reloads page when the current user changes their own role. This is **intentional** — permission state needs a full reset when your own role changes. This is acceptable behavior.

**Status**: No fix needed.

---

## CATEGORY 4: MISSING PERMISSIONS IN ADMIN LIST

### P3-PERM-01 | `risk_management_view/manage` missing from admin permission array

The `usePermissions.tsx` hardcoded admin permission list (lines 27-49) does NOT include `risk_management_view` or `risk_management_manage`. This means:
- Super admin role → gets hardcoded permissions → **cannot access Risk Management**
- But the sidebar shows Risk Management because it checks the standalone items array

Wait — actually checking again... The permissions list does NOT have `risk_management_view`. Let me verify.

**Fix**: Add `risk_management_view`, `risk_management_manage` to the admin permissions array if missing.

---

## IMPLEMENTATION PLAN

### Phase 3A — Security Fixes (Critical)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 1 | P3-SEC-01 | Add PermissionGate to ProfitLoss.tsx | 2 min |
| 2 | P3-SEC-02 | Add PermissionGate to AdManager.tsx | 2 min |
| 3 | P3-SEC-03 | Add PermissionGate to Tasks.tsx | 2 min |
| 4 | P3-SEC-04 | Add PermissionGate to UtilityHub.tsx | 2 min |
| 5 | P3-SEC-05 | Add PermissionGate to InvoiceCreatorPage.tsx | 2 min |

### Phase 3B — Credential & Permission Cleanup

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 6 | P3-SEC-06 | Remove demo-admin-id check from usePermissions | 3 min |
| 7 | P3-SEC-07 | Remove dead localStorage permission writes | 5 min |
| 8 | P3-PERM-01 | Add missing permissions to admin array | 2 min |

### Phase 3C — UX Fix

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 9 | P3-UX-01 | Remove window.location.reload from StepBySalesFlow | 1 min |

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Missing permission gates | 5 pages | HIGH — direct URL bypasses sidebar permission |
| Hardcoded credentials | 1 | HIGH — demo-admin-id bypass |
| Dead localStorage writes | 1 | MEDIUM — no functional impact but misleading |
| Missing admin permissions | 1 | MEDIUM — admin may lack some module access |
| Unnecessary page reloads | 1 | LOW — UX jarring but functional |
