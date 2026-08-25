# ERP Permission Library — Full Rebuild (Phased)

## What I verified first

- The role editor's permission matrix (`EditRoleDialog`) lists 20 module groups. It is a hand-written list that has drifted from both the database enum and the actual app.
- The database enum `app_permission` currently holds 100 values, including ~46 dead legacy values (`view_dashboard`, `MANAGE_HRMS`, `admin_access`, …) that nothing in the app checks any more.
- Two permissions the app actively checks **do not exist in the enum at all**: `risk_management_view` / `risk_management_manage` and `support_view` / `support_manage`. Saving a role with them fails the same way `bams_journal_entry` did — so Risk Management access can currently only be obtained by being Super Admin.
- Finance is under-modelled: **Tax Management (`/accounting`), P&L (`/profit-loss`) and Financials (`/financials`) all share the single `accounting_view` / `accounting_manage` pair**, and Statistics exists in the enum but has no sub-tab control. There is no way to give someone P&L without Tax Management, or vice-versa.
- Enum values that exist but are missing from the role editor UI: `video_kyc_*`, `kyc_approvals_*`, `help_assistant_*`, `hrms_razorpay_sync`.
- `/hrms` and all ~90 HRMS sub-routes are protected only by a login check — there is **no permission gate on the HRMS layout**. The sidebar hides the entry, but typing the URL loads the module. Database RLS still applies, so this is a UI-exposure gap, not a data leak.
- Reconciliation is gated by a bespoke hook, and Report Formats by a hard-coded Super-Admin check — neither is expressible as a role permission.

## Approach

Build one **single source of truth** permission catalog in code (`src/lib/permissions/catalog.ts`) that every consumer reads: the role editor, the sidebar, page gates, and the seed/verification scripts. Each entry declares its key, module, sub-module, label, description, tier (view / manage / approve / destructive / special) and the route(s) it protects. The enum in the database is then kept in lock-step with that catalog, and the role editor renders itself from it — so a new permission can never again exist in the UI but not the DB (or the reverse).

Granularity rule: **module = view/manage pair; separately-navigable page or an irreversible action = its own permission.** Not every button gets a permission — that becomes unmanageable.

## Phases

### Phase 1 — Foundation and the immediate gaps
- Create the catalog module with tier metadata and module/sub-module grouping.
- Add the missing enum values so existing checks actually work: `risk_management_view`, `risk_management_manage`, `support_view`, `support_manage`.
- Split Finance apart: new `tax_management_view/manage`, `profit_loss_view`, `financials_view/manage`, `statistics_view/manage` (the last already exists). Keep `accounting_view/manage` alive as a legacy alias that grants the split set, so no existing role loses access on deploy.
- Rewrite `EditRoleDialog` + `AddRoleDialog` to render from the catalog (removes the two divergent hand-written lists).
- Wire the split permissions into `AppSidebar` and the four finance pages.

### Phase 2 — Close the unguarded surfaces
- Add a permission gate to the HRMS layout (`hrms_view`) so URL access matches sidebar visibility.
- Add gates to the pages that have none, and convert the bespoke Reconciliation hook and the Super-Admin-only Report Formats check into real permissions (`reconciliation_view`, `report_formats_manage`) that keep their current effective behaviour by default.
- Surface the orphan enum values (`video_kyc_*`, `kyc_approvals_*`, `help_assistant_*`, `hrms_razorpay_sync`) in the matrix under their proper modules.

### Phase 3 — HRMS sub-module permissions
HRMS is the largest module in the ERP and is currently all-or-nothing. Introduce sub-module permissions: Employees, Attendance, Leave, Payroll, Recruitment, Documents, Assets, PMS, Mailbox, Data Health/System Pulse — each `view`/`manage`, plus approvals for leave and regularization. `hrms_view`/`hrms_manage` continue to work as the umbrella grant.

### Phase 4 — Terminal alignment
Terminal already has its own 60-permission system (`useTerminalAuth`) separate from the ERP enum. Fold its catalog into the same library file so both matrices are described in one place and the ERP↔Terminal boundary is documented — no behavioural change to Terminal grants.

### Phase 5 — Hygiene, templates, verification
- Mark the ~46 legacy enum values as deprecated in the catalog, hide them from the UI, and report any role still carrying one so it can be re-mapped. (Postgres cannot drop enum values; they stay in the type but become unreachable.)
- Rebuild the Quick Templates (Read-Only Auditor, Full Operations, Finance View-Only) from the catalog, and add role presets that reflect the real org: Operations, Finance, HR, Compliance, Terminal Operator.
- Add a check script that fails when a catalog key is missing from the enum, an enum value is missing from the catalog, or a permission string is checked in code but absent from the catalog.

## Technical notes

- New enum values are added with `ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS ...` in a dedicated migration; enum additions cannot be rolled back, so each phase's additions are reviewed with the phase.
- Legacy-to-new aliasing lives in `get_user_permissions` expansion (or a catalog-side expansion in `usePermissions`) so no role is silently downgraded when finance splits.
- `usePermissions` caching (memory + localStorage) is untouched; the persisted permission list simply gains the new keys after refresh.
- No RLS policy is loosened anywhere in this work. Permissions added here control UI/route access; database policies keep their existing predicates.

## Confirm before Phase 1 starts

Two decisions I would default as follows unless you say otherwise: legacy `accounting_view/manage` is preserved as an alias (nobody loses access), and Reconciliation / Report Formats keep their current effective access by being seeded onto the roles that have it today.
