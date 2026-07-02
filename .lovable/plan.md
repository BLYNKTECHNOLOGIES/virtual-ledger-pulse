# Enterprise UI Polish — keep existing theme, refine only

Make the ERP feel like a premium SaaS product instead of a raw spreadsheet — **without changing the theme, colors, or any business logic, APIs, database, calculations, permissions, workflows, or data**. This is pure presentation polish: spacing, alignment, typography hierarchy, consistency, component states, tables, forms, badges, and empty/loading states.

Scope: **light main ERP only** (dark P2P Terminal untouched).

## Hard constraints
- **No theme/color changes.** Keep the current HSL tokens in `src/index.css` and `tailwind.config.ts` exactly as-is (primary indigo, neutrals, radius, fonts). Do NOT retune the palette.
- No changes to queries, mutations, hooks, edge functions, RPCs, permissions, routing, or column/data definitions.
- No moved tabs/nav items; no workflow redesign; no new heavy dependencies.
- Components use existing semantic tokens only (no hardcoded colors).

## Phase 1 — Shared primitives (propagate everywhere, same colors)
Refine spacing, sizing, states, and consistency only — no new colors:
- `button.tsx` — clearer size/padding rhythm, consistent hover/disabled/focus states (variants & colors unchanged).
- `table.tsx` — comfortable row height, refined header weight/spacing, quiet hover, hairline dividers; keep existing sticky-header/density support and current colors.
- `badge.tsx` — standardize status usage (Active/Pending/Completed/Paid/Overdue/Cancelled/Draft/Approved) using the **existing** success/warning/info/destructive/muted tokens; optional leading dot for scannability. No new palette.
- `card.tsx` — consistent padding, radius, existing `shadow-sm`, gentle hover elevation.
- `input.tsx`, `select.tsx`, `textarea.tsx`, `label.tsx`, `checkbox.tsx`, `radio-group.tsx` — consistent height, spacing, focus ring, placeholder, required/validation affordances (using current ring/border tokens).
- `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `tabs.tsx` — standardize width/spacing/header-footer and button placement (reuse existing motion polish).
- `skeleton.tsx` + reusable empty-state — lightweight loading/empty treatments in current colors.

## Phase 2 — Shell polish (same theme)
Files: `AppSidebar.tsx`, `TopHeader.tsx`, `Layout.tsx`
- Refine sidebar spacing, active-state clarity, icon alignment; polish header search/account spacing. Keep all nav positions, collapse/resize behavior, and colors unchanged.

## Phase 3 — High-traffic surfaces (verify propagation)
Spot-check the busiest pages and align page-header pattern (title + subtitle + action), spacing, and status badges without changing data/columns:
- Sales, Clients/CRM, Stock/Inventory, Accounting/Tax, Statistics, User Management, and the bespoke `invoice/OrdersTable.tsx`.

## Verification
- Build/typecheck passes; no console/runtime errors.
- Drive Playwright on the live preview to confirm polish renders and nothing breaks; confirm colors are visually unchanged vs. before.
- Reduced-motion still disables animations.

I'll implement in phase order and check in after Phase 1 so you can confirm on real screens before rolling wider.
