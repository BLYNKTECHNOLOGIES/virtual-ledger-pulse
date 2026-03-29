

# Terminal Permission System — Staged Implementation Plan

## Final Permission Set (50 permissions after consolidations)

Your consolidation requests applied:

| Consolidated Into | Merged From |
|---|---|
| `terminal_payer_manage` | payer_lock + payer_mark_paid + payer_release |
| `terminal_ads_manage` | ads_update + ads_payment_methods |
| `terminal_pricing_manage` | pricing_create + pricing_edit |
| `terminal_shift_manage` | shift_handover_initiate + shift_handover_respond |
| `terminal_assets_manage` | assets_manage + assets_spot_trade |
| `terminal_orders_manage` | orders_assign + orders_reassign + orders_unassign |
| Dropped: `terminal_orders_sync_reject` | — |

```text
MODULE: DASHBOARD (2)
  terminal_dashboard_view
  terminal_dashboard_export

MODULE: ORDERS (7)
  terminal_orders_view
  terminal_orders_manage          ← assign/reassign/unassign
  terminal_orders_sync_approve
  terminal_orders_escalate
  terminal_orders_resolve_escalation
  terminal_orders_chat
  terminal_orders_export

MODULE: ADS (4)
  terminal_ads_view
  terminal_ads_manage             ← update + payment methods
  terminal_ads_toggle
  terminal_ads_rest_timer

MODULE: PAYER (2)
  terminal_payer_view
  terminal_payer_manage           ← lock + mark_paid + release

MODULE: PRICING (4)
  terminal_pricing_view
  terminal_pricing_manage         ← create + edit
  terminal_pricing_toggle
  terminal_pricing_delete

MODULE: AUTOPAY (3)
  terminal_autopay_view
  terminal_autopay_toggle
  terminal_autopay_configure

MODULE: AUTOREPLY (3)
  terminal_autoreply_view
  terminal_autoreply_manage
  terminal_autoreply_toggle

MODULE: USERS & TEAM (6)
  terminal_users_view
  terminal_users_manage
  terminal_users_role_assign
  terminal_users_bypass_code
  terminal_users_manage_subordinates
  terminal_users_manage_all

MODULE: SHIFT & HANDOVER (3)
  terminal_shift_view
  terminal_shift_manage           ← initiate + respond
  terminal_shift_reconciliation

MODULE: ANALYTICS & MPI (4)
  terminal_analytics_view
  terminal_analytics_export
  terminal_mpi_view_own
  terminal_mpi_view_all

MODULE: ASSETS (2)
  terminal_assets_view
  terminal_assets_manage          ← manage + spot trade

MODULE: KYC (2)
  terminal_kyc_view
  terminal_kyc_manage

MODULE: SETTINGS & BROADCASTS (4)
  terminal_settings_view
  terminal_settings_manage
  terminal_broadcasts_create
  terminal_broadcasts_manage

MODULE: AUDIT & LOGS (3)
  terminal_audit_logs_view
  terminal_activity_logs_view
  terminal_pricing_logs_view

MODULE: DESTRUCTIVE (1)
  terminal_destructive

TOTAL: 50 permissions
```

---

## Stage 1: Database — Enum Expansion + Security Fixes

**What it does:** Adds ~30 new enum values to `terminal_permission`, fixes 3 confirmed bugs, and creates the `has_terminal_permission()` helper function.

### 1A. Add new enum values
Add all new permission values listed above that don't already exist in the enum (e.g., `terminal_orders_escalate`, `terminal_pricing_view`, `terminal_mpi_view_own`, etc.). Old values like `terminal_automation_view` stay — they become unused but harmless.

### 1B. Security bug fixes (data operations)
- **BUG-02:** Remove `terminal_settings_manage` from PAYER/OPERATOR role
- **BUG-03:** Add `terminal_assets_manage` to Admin role

### 1C. Create `has_terminal_permission()` SQL function
Security definer function that checks if a user has a specific terminal permission. Used by RPCs in Stage 4.

### 1D. Gate `save_terminal_role` (BUG-05 — CRITICAL)
Add permission check (`terminal_users_role_assign`) + hierarchy guard (cannot create roles at/above own level) + **delegation guard** (cannot grant permissions the caller doesn't have).

---

## Stage 2: Database — Role Permission Migration

**What it does:** Expands old coarse permissions into new granular ones for each existing role, then differentiates the collapsed tiers.

### 2A. Legacy permission expansion
For each role's existing permissions, map old to new:
- `terminal_orders_manage` → `terminal_orders_manage` + `terminal_orders_sync_approve` + `terminal_orders_chat` + `terminal_orders_export` + `terminal_orders_escalate`
- `terminal_automation_manage` → `terminal_pricing_manage` + `terminal_pricing_toggle` + `terminal_autopay_toggle` + `terminal_autopay_configure` + `terminal_autoreply_manage` + `terminal_autoreply_toggle` + `terminal_broadcasts_create`
- `terminal_automation_view` → `terminal_pricing_view` + `terminal_autopay_view` + `terminal_autoreply_view`
- `terminal_mpi_view` → `terminal_mpi_view_all` (for level ≤ 2) or `terminal_mpi_view_own` (for level > 2)
- `terminal_orders_actions` → `terminal_orders_escalate` + `terminal_orders_resolve_escalation`
- `terminal_payer_manage` stays as-is (same key, broader scope now)

### 2B. Tier differentiation
Fix the collapse problem (BUG-01) where Ops Manager = Asst Manager = Team Lead:

| Role (Level) | Approximate Count | Key differences from level above |
|---|---|---|
| Admin (0) | All 50 | Full access |
| COO (1) | ~43 | No destructive, no users_manage_all, no pricing_delete, no users_role_assign, no settings_manage, no broadcasts_manage |
| Ops Manager (2) | ~37 | COO minus pricing_manage, autopay_configure, orders_sync_approve, kyc_manage, shift_reconciliation, assets_manage |
| Asst Manager (3) | ~31 | Ops Mgr minus pricing_toggle, autopay_toggle, ads_rest_timer, analytics_export, orders_export, users_manage (gets manage_subordinates only) |
| Team Lead (4) | ~25 | Asst Mgr minus autoreply_manage, broadcasts_create, shift_reconciliation, ads_manage, mpi_view_all (gets _own), users_bypass_code, activity_logs_view |
| Operator (5) | ~14 | View + escalate + chat only |
| Payer (5) | ~10 | View + payer_manage only |
| Payer/Operator (5) | Union of above | ~18 |
| RM | ~8 | View-only cross-module |
| Viewer | ~5 | Minimal views |

---

## Stage 3: Frontend — Type Updates + Role Editor UI Overhaul

**What it does:** Updates TypeScript types and completely redesigns the role editor UI.

### 3A. Update `useTerminalAuth.tsx`
- Expand `TerminalPermission` type union with all 50 permission strings
- Update `ALL_TERMINAL_PERMISSIONS` array for Super Admin bypass

### 3B. Redesign `TerminalRolesList.tsx` — Role Editor Dialog
Replace the current accordion-with-checkboxes layout with a **module grid** layout:

```text
┌─────────────────────────────────────────────────┐
│ Role Name: [________]  Level: [__]              │
│ Description: [____________________________]     │
│                                                 │
│ Permissions (18/50)              [Select All]   │
│                                                 │
│ ┌─ Orders ───────────────────── 5/7 ────────┐  │
│ │ [●] View    [●] Manage    [○] Sync Approve│  │
│ │ [●] Escalate [○] Resolve  [●] Chat        │  │
│ │ [○] Export                                 │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ ┌─ Pricing ──────────────────── 2/4 ────────┐  │
│ │ [●] View    [○] Manage    [●] Toggle      │  │
│ │ [🔒] Delete (you don't have this)         │  │
│ └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Key UI features:
- **Module cards** with toggle switches, not nested accordions
- **Color-coded risk tiers:** Green (view), Blue (manage), Red (destructive/delete), Amber (role_assign, bypass_code)
- **Delegation lock:** Permissions the current user doesn't have are shown disabled with a lock icon and tooltip "You don't have this permission"
- **Select All** only selects permissions the user themselves possess
- **Counter badge** per module showing granted/total
- **Prerequisite auto-enable:** Toggling a manage permission auto-enables its view counterpart

### 3C. Update role card display
Show permissions grouped by module with color-coded badges instead of the current flat `font-mono` list.

---

## Stage 4: Backend — RPC Enforcement + Audit Trail

**What it does:** Adds server-side permission checks to high-risk RPCs and creates an audit log.

### 4A. Gate high-risk RPCs
Add `has_terminal_permission()` checks to:
- `save_terminal_role` → `terminal_users_role_assign` (done in Stage 1D)
- `escalate_terminal_order` → `terminal_orders_escalate`
- `lock_payer_order` / `mark_payer_order_paid` → `terminal_payer_manage`
- `initiate_shift_handover` → `terminal_shift_manage`
- `generate_terminal_bypass_code` → `terminal_users_bypass_code`

### 4B. Create `terminal_permission_change_log` table
```sql
terminal_permission_change_log (
  id, role_id, role_name, action, permission, changed_by, created_at
)
```
Plus a trigger on `p2p_terminal_role_permissions` that logs every insert/delete.

### 4C. Update `save_terminal_role` to diff-and-log
Instead of delete-all + re-insert, compute the diff and log added/removed permissions with actor attribution.

---

## Stage 5: Frontend — Granular Page-Level Gating

**What it does:** Updates individual terminal pages to use the new granular permissions.

### 5A. Orders page
- Sync approve buttons gated by `terminal_orders_sync_approve`
- Export button gated by `terminal_orders_export`
- Escalate action gated by `terminal_orders_escalate`
- Resolve escalation gated by `terminal_orders_resolve_escalation`

### 5B. Automation pages
- Pricing section: `terminal_pricing_view` / `terminal_pricing_manage` / `terminal_pricing_toggle` / `terminal_pricing_delete`
- Autopay section: `terminal_autopay_view` / `terminal_autopay_toggle` / `terminal_autopay_configure`
- Autoreply section: `terminal_autoreply_view` / `terminal_autoreply_manage` / `terminal_autoreply_toggle`

### 5C. MPI page
- Check `terminal_mpi_view_all` vs `terminal_mpi_view_own` to filter data scope

### 5D. Users page
- Role assignment gated by `terminal_users_role_assign`
- Bypass code gated by `terminal_users_bypass_code`
- User list scope: `terminal_users_manage_all` vs `terminal_users_manage_subordinates`

### 5E. Sidebar navigation
- Update visibility checks to use new granular permissions (e.g., pricing section visible with `terminal_pricing_view`)

---

## What is NOT included (deferred/skipped)

| Item | Status | Reason |
|---|---|---|
| `terminal_permission_metadata` DB table | **Skipped** | Hardcode labels in frontend component — we control the full stack |
| `get_terminal_tab_capabilities()` RPC | **Skipped** | Frontend `hasPermission()` inline checks are sufficient |
| `expand_legacy_terminal_permission()` function | **Skipped** | Single atomic migration, no transition period |
| Temporary permission grants (`expires_at`) | **Skipped** | Not needed at 150 users |
| Role comparison side-by-side view | **Deferred** | Nice-to-have, not core |

---

## Files affected per stage

| Stage | Files |
|---|---|
| 1 | Migration SQL (enum + `has_terminal_permission` + gate `save_terminal_role`) |
| 2 | Data operation SQL (expand permissions + differentiate roles) |
| 3 | `useTerminalAuth.tsx`, `TerminalRolesList.tsx` |
| 4 | Migration SQL (audit log table + trigger), RPC updates |
| 5 | `TerminalOrders.tsx`, automation page components, MPI page, Users page, `TerminalSidebar.tsx` |

