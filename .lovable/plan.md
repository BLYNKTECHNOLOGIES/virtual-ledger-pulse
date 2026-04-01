

## Problem

The screenshot shows "Insufficient permissions" on the **Ads Manager** page in the terminal. The root cause is a **dual permission gate conflict**:

1. `AdManager.tsx` (shared between ERP and Terminal) wraps content in the **ERP** `PermissionGate` checking `terminal_view`
2. Shivangi (COO) has all the correct **terminal-module** permissions (`terminal_settings_view`, `terminal_ads_view`, etc.) via `p2p_terminal_role_permissions`
3. But her ERP role (COO) only has `terminal_destructive` — it's **missing** `terminal_view` and `terminal_manage`

The `/terminal/ads` route uses `<AdManager />` directly (not `<TerminalAdManager />`), so the inner ERP gate blocks access even though the terminal-level gate would pass.

## Fix

**Two changes needed:**

### 1. Add missing ERP permissions to COO role
SQL migration to grant `terminal_view` and `terminal_manage` to the COO role. Any user with terminal access via `p2p_terminal_user_roles` should also have the base ERP `terminal_view` permission to prevent this gate conflict.

### 2. Fix the terminal ads route to use TerminalAdManager
In `App.tsx` line 438, change `<AdManager />` to `<TerminalAdManager />` so the terminal-specific permission gate (`terminal_ads_view`) is used instead of the ERP gate. The `TerminalAdManager` component already exists and wraps `AdManager` in a `TerminalPermissionGate`.

Alternatively, modify `AdManager.tsx` to skip the ERP `PermissionGate` when rendered inside a terminal context (detected by checking if `TerminalAuthProvider` is available). This is cleaner long-term.

### 3. Audit other shared pages for the same issue
Check if any other terminal pages reuse ERP components with ERP-level `PermissionGate` wrappers that would similarly block terminal-only users.

### Files to change
| File | Change |
|------|--------|
| New migration | Grant `terminal_view`, `terminal_manage` to COO role |
| `src/App.tsx` | Use `TerminalAdManager` for `/terminal/ads` route |
| `src/pages/AdManager.tsx` | Remove or conditionalize the ERP `PermissionGate` wrapper when inside terminal context |

