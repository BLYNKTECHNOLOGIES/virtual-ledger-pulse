# ERP Visual Refinement — Polish, Not Redesign

## Guiding Rule
Every existing screen must remain instantly recognizable. We only refine the *visual layer*: spacing, typography, radius, shadows, badges, hover/focus, and color contrast. No changes to layouts, navigation, control positions, workflows, interactions, business logic, APIs, DB, calculations, or permissions.

The current theme stays: light-blue primary (`231 81% 60%`), neutral gray surfaces, `--radius: 0.75rem`, Inter, and the fully isolated dark Terminal theme is **out of scope** (untouched).

## Approach
Work centrally through shared design tokens and shadcn primitives so improvements propagate to every screen automatically, without touching page structure. Some Phase 1 primitive work (badge soft variants + dot, table head micro-labels) is already in place and will be built upon — not reverted.

```text
Tokens (index.css / tailwind.config)  →  Primitives (ui/*)  →  Shell (sidebar/header)  →  Verify high-traffic pages
        refine values only                refine styling only        spacing/alignment only        no structural edits
```

## Phase 1 — Foundation Tokens (theme-safe)
In `src/index.css` `:root` and `.dark` (light + dark ERP only, never `.terminal`):
- Keep primary hue; add subtle depth tokens: a soft elevation shadow scale (`--shadow-xs/sm/md`) built from low-opacity neutral, used minimally.
- Slightly refine `--border` / `--muted` contrast for cleaner separation without changing perceived color.
- Confirm `--success/--warning/--info/--destructive` are consistent and accessible; no hue identity change.
- No new brand color, no palette swap.

## Phase 2 — Shared Primitives (`src/components/ui/*`)
Refine styling only, preserving all sizes/APIs so nothing shifts position:
- **button.tsx** — tighter focus ring, consistent subtle shadow, crisper hover; primary stays the same blue but reads as the clear primary action. Destructive stays clearly red.
- **input.tsx / textarea / select** — consistent height, padding, focus ring, and border states.
- **card.tsx** — consistent padding and a single restrained shadow/border treatment.
- **table.tsx** — build on existing uppercase micro-label heads; refine row height, zebra/hover, cell padding, and alignment (tabular-nums for numeric columns).
- **badge.tsx** — keep the already-added soft status variants (`success/warning/info/muted/destructive-soft`) and `dot` prop; ensure consistent sizing.
- **dialog / dropdown / tabs / toast** — subtle fade/scale transitions (fast, ≤150ms), consistent padding and radius.

## Phase 3 — Shell Polish
`AppSidebar` and top header: refine spacing, active-item treatment, icon alignment, and section grouping only. Navigation structure, order, and positions unchanged.

## Phase 4 — High-Traffic Surface Verification
Spot-check that refinements propagate cleanly and fix only inconsistencies (ad-hoc hardcoded colors, uneven spacing) on: Sales, Client Onboarding Approvals, Seller Approvals, Financials, Stock, Accounting/Tax Management. No structural or logic edits — replace any stray hardcoded color utilities with the existing semantic tokens where found.

## Animations
Only fast micro-interactions: button hover/active, focus rings, dropdown/modal fade+scale, toast slide. Nothing that delays interaction.

## Explicit Non-Goals
- No layout, grid, or navigation restructuring.
- No moving/removing buttons or controls.
- No Terminal theme changes.
- No workflow, API, DB, calculation, or permission changes.
- No new heavy animation libraries or route-level transitions.

## Verification
- Typecheck after each phase.
- Playwright screenshots of login (public) + a couple of authenticated high-traffic pages before/after to confirm recognizability and polish.
- Confirm no color-token identity drift in light and dark ERP modes.
