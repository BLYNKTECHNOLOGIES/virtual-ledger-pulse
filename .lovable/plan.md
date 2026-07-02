# ERP Visual Refinement — Consistency Sweep (Pass 2)

**Philosophy:** ~80–90% visual improvement, ~95–98% layout/navigation/interaction preserved. Every screen stays instantly recognizable; controls stay where they are. Comfortable density retained. Sidebar keeps its blue/white identity — subtle polish only.

The foundation is already done (Pass 1): elevation-shadow tokens, refined button/input/card/dialog primitives, refined table heads, softer overlay, cleaner sidebar active state. This pass propagates that quality *evenly* across all main ERP surfaces by removing visual inconsistency — mainly stray hardcoded colors and uneven spacing — without touching structure, logic, APIs, data, or permissions.

## Core Technique
1. **Tokenize stray colors** — replace ad-hoc `bg-white`, `text-gray-*`, `border-gray-*`, `bg-blue-*`, `text-red-*`, hex values in *page content* (not the sidebar brand chrome) with the existing semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `text-primary`, `text-destructive`, `bg-success/warning/info`). This fixes contrast, dark-mode, and consistency in one move without changing perceived light-mode color.
2. **Standardize status pills** — route status text/labels through the existing soft `Badge` variants (`success/warning/info/muted/destructive-soft` + `dot`) so every page shows status the same way.
3. **Align spacing** — consistent card padding, section gaps, and header rhythm using the refined primitives; keep comfortable density (no row tightening).
4. **Consistent headers** — page titles, section headers, and table micro-labels use the same type scale already defined in primitives.

No new fonts, no layout/grid restructuring, no moved controls.

## Rollout (evenly, in traffic order)
Because "everything evenly" was chosen, work proceeds surface-by-surface but each surface gets the *same* checklist so quality is uniform.

- **Phase A — Daily-use ERP:** Dashboard, Sales, Client Onboarding Approvals, Seller Approvals, Financials, Stock.
- **Phase B — CRM & Client detail:** Client directory, onboarding, order history, KYC/detail dialogs.
- **Phase C — HR & Accounting:** Payroll, attendance, Tax Management, Statistics.
- **Phase D — Shared shell & remaining screens:** subtle sidebar polish (spacing, hover, active — no color identity change), top header, any leftover modules for full consistency.

## Per-Surface Checklist (applied identically everywhere)
- Replace hardcoded color utilities with semantic tokens.
- Normalize card/section padding and gaps.
- Route status indicators through the soft Badge variants.
- Consistent button variants (primary = clear main action, destructive = clearly red, secondary/outline for the rest).
- Consistent input/select/focus states via refined primitives.
- Consistent table styling (already tokenized heads, tabular-nums on numeric columns).
- Verify hover/focus states and no layout shift.

## Animations
Only fast micro-interactions already in place (hover, focus ring, dropdown/modal fade+scale ≤200ms, toast). Nothing added that slows the ERP.

## Explicit Non-Goals
- No layout, grid, or navigation restructuring; no moved/removed controls.
- No sidebar color-identity change (subtle polish only).
- No density change (comfortable retained).
- No workflow, API, DB, calculation, or permission changes.
- No Terminal theme changes.
- No new fonts or heavy animation libraries.

## Verification
- Typecheck after each phase.
- Playwright before/after screenshots of representative pages per phase (Sales, a client detail, an HR page) to confirm recognizability + polish.
- Confirm no token identity drift in light and dark ERP modes; confirm no shifted controls.
