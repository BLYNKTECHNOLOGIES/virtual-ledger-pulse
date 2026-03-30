

# Terminal Bug Audit — Round 3

## Bugs Found

### BUG 1 (HIGH): Missing Permission Gates on 5 Pages
The following pages have **no `TerminalPermissionGate`** wrapper, meaning any terminal user can access them via direct URL regardless of permissions:

| Page | File | Missing Gate |
|------|------|-------------|
| Dashboard | `TerminalDashboard.tsx` | `terminal_dashboard_view` |
| Analytics | `TerminalAnalytics.tsx` | `terminal_analytics_view` |
| Assets | `TerminalAssets.tsx` | `terminal_assets_view` |
| MPI | `TerminalMPI.tsx` | `terminal_mpi_view_own` |
| Automation | `TerminalAutomation.tsx` | `terminal_pricing_view` (sidebar uses this) |

The sidebar already filters these items based on permissions, but a user can bypass the sidebar by typing the URL directly (e.g., `/terminal/analytics`).

**Fix**: Wrap each page's return in `<TerminalPermissionGate>` with the appropriate permission, matching what the sidebar already enforces.

### BUG 2 (MEDIUM): Settings Page imports PermissionGate but never uses it
`TerminalSettings.tsx` imports `TerminalPermissionGate` (line 15) but the component's return (line 282) does **not** wrap content with it. The import is dead code and the page is unguarded.

**Fix**: Wrap the Settings page content with `<TerminalPermissionGate permissions={['terminal_settings_view']}>`.

### BUG 3 (LOW): TerminalAnalytics `thirtyDaysAgo` causes infinite re-renders
In `TerminalAnalytics.tsx` line 79, `thirtyDaysAgo` is computed as a plain `const` (not memoized). It creates a new number on every render. It's then used as a dependency in `useMemo` on line 80:
```ts
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
const recentOrders = useMemo(() => orders.filter(...), [orders, thirtyDaysAgo]);
```
Since `thirtyDaysAgo` changes every render, `recentOrders` recalculates every render, defeating the purpose of `useMemo`.

**Fix**: Wrap `thirtyDaysAgo` in `useMemo` with empty deps, or remove it from the dependency array since it's essentially a constant within a session.

### BUG 4 (LOW): Logs page (`TerminalLogs.tsx`) has no permission gate
The Logs page is accessible via `/terminal/logs` without checking `terminal_logs_view` permission.

**Fix**: Wrap with `<TerminalPermissionGate permissions={['terminal_logs_view']}>`.

---

## Implementation Plan

### Step 1: Add Permission Gates to 6 Unguarded Pages
Add `<TerminalPermissionGate>` wrapper to:
- `TerminalDashboard.tsx` → `terminal_dashboard_view`
- `TerminalAnalytics.tsx` → `terminal_analytics_view`
- `TerminalAssets.tsx` → `terminal_assets_view`
- `TerminalMPI.tsx` → `terminal_mpi_view_own`
- `TerminalAutomation.tsx` → `terminal_pricing_view`
- `TerminalSettings.tsx` → `terminal_settings_view` (use existing import)
- `TerminalLogs.tsx` → `terminal_logs_view`

### Step 2: Fix `thirtyDaysAgo` memo leak in TerminalAnalytics
Move `thirtyDaysAgo` inside the `useMemo` for `recentOrders`, removing it as a dependency.

---

## Summary
- 7 frontend file edits
- No new functionality
- No SQL changes needed
- Fixes direct URL bypass for all unguarded terminal pages

