# ERP Visual System Modernization — Foundation + Dashboard

Frontend only. No backend, schema, calculation, workflow, permission, or API changes. Nothing is removed — every existing widget, action, drag-and-drop behaviour and data path stays exactly as it is.

## What already exists

The app already has HSL semantic tokens in `src/index.css` (`--background`, `--primary: 231 81% 60%`, `--radius: 0.75rem`, four shadow steps), Inter wired as the sans font in `tailwind.config.ts`, and shared primitives (`PageHeader`, `EmptyState`, HRMS `StatCard` / `StatusPill` / `SectionHeader`). The gap is not "no tokens" — it is that the scale is loose, several surfaces use ad-hoc styling, and there is no single documented type/spacing/density contract that pages must follow.

So step one is to tighten and formalize the existing token layer rather than introduce a competing one.

## Step 1 — Global design system (foundation)

**Typography scale** — add token-backed utility classes in `index.css`:
`.t-page-title` (26px/600), `.t-section` (17px/600), `.t-card-title` (14px/600), `.t-body` (14px/400), `.t-secondary` (12px), `.t-kpi` (28px/600, tabular-nums). Tighten letter-spacing on the large sizes. Reduce reliance on scattered `font-bold`.

**Spacing** — restrict to the 4/8/12/16/20/24/32/40 ladder (Tailwind `1,2,3,4,5,6,8,10`). Add `--space-*` variables for CSS use and a `.page-shell` container class (consistent page padding + vertical rhythm) so pages stop inventing their own gaps.

**Color** — keep the Blynk indigo primary; keep `--success/--warning/--info/--destructive`. Add a documented rule: color carries meaning only. Multi-colored decorative metric icons on the dashboard collapse to a neutral treatment, with semantic color reserved for deltas, statuses and alerts.

**Surfaces / borders / radius** — normalize on: card = 1px `--border`, `--shadow-xs` at rest, `--shadow-sm` on hover, radius 12px; small controls 8px; large containers 16px. Add `--radius-sm/md/lg` derived tokens and map Tailwind `rounded-*` through them. Remove heavy shadows and gradient fills from standard cards (login/terminal show-pieces untouched).

**Motion** — a shared 120–180ms ease-out transition token applied to hover, press, dropdown, dialog and toast; all wrapped in `prefers-reduced-motion` guards.

## Step 2 — Reusable component styling

Update the shared shadcn primitives in place so every page inherits the new look without page edits:

- `button` — tighter heights (32/36/40), clearer primary vs. quiet secondary/ghost, destructive on the error token, plus a `loading` affordance.
- `input`, `select`, `textarea` — 36px default height, 8px radius, ring-based focus, consistent label spacing.
- `card`, `dialog`, `dropdown-menu`, `popover`, `tabs`, `badge`, `tooltip`, `alert`, `sonner` toasts, `skeleton` — aligned to the same radius/border/shadow/motion contract.
- New `src/components/shared/DataTable` styling layer: sticky header, subtle row separators, hover row, compact density, status-badge and row-action slots. Introduced as an opt-in wrapper; no existing table is rewritten in this step.
- Shared `StatCard` (ERP flavour), `SectionHeader`, `LoadingState` / skeleton set placed in `src/components/shared/`.

Icons: standardize on lucide-react at 16px (18px for headers) — it is already the only library in use; this pass just normalizes sizes.

## Step 3 — Apply to the Dashboard only

`src/pages/Dashboard.tsx` and `src/components/dashboard/*` are restyled with the new system:

- Page header on the new title scale, actions right-aligned and quieted.
- Metric cards rebuilt on the shared StatCard: neutral icon chip, 28px tabular KPI value, semantic-colored delta line only.
- Widget shells (`DashboardWidget`, `DraggableDashboardSection`) get the unified card treatment, consistent 16px internal padding, subtle hover, and a restrained drag handle.
- Action Required / Quick Links / Recent Activity / Heatmap: consistent section headers, tighter density, skeletons instead of ad-hoc loaders.
- Responsive: 1 column on mobile, 2 on tablet, 12-col grid on desktop — the existing adaptive-span logic is preserved untouched.

Drag-and-drop, widget registry, persistence, sync buttons, permissions and every query stay byte-identical in behaviour.

## Verification

Playwright pass on `/dashboard` at 390px, 834px and 1440px in light and dark mode, screenshots reviewed, console checked for errors, and a diff review confirming no query/handler/permission logic changed.

## Out of scope for this pass

Other ERP pages, HRMS, and Terminal keep their current look; they will pick up the foundation gradually in later passes once the Dashboard confirms the direction.
