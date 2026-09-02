# Data Health — UI/UX cleanup (no behaviour change)

The page currently stacks nine full-width blocks of equal visual weight (KPI strip, three payroll tiles, RazorpayX orphans, ERP accounts, ghost-email residual, statutory drift, unknown enrollment, filters, drift list) inside a narrow centred column. Everything shouts at the same volume, so nothing reads as "act on this now". The fix is hierarchy and width, not new functionality.

## What changes

**1. Full desktop width**
Drop the `max-w-7xl` cap so the page uses the available viewport (with a sensible outer padding). On wide screens the layout becomes two columns: the drift worklist on the left (primary work surface) and the health/status panels on the right rail. Below `xl` it collapses back to today's single stacked column.

**2. One compact command bar**
Merge the title row, the KPI strip and the filters into a single sticky bar:
- Title + employee-filter chip + "Rescan now" on the top line.
- Counters (Open / Unexplained / Critical / High / Medium / Employees) become small inline pill counters that are also **clickable filters** (clicking "Critical" sets the severity filter) instead of six oversized number cards.
- Severity / system-pair selects move next to them as shadcn `Select` controls, replacing the raw `<select>` elements so they match the rest of HRMS.

**3. Status panels become a collapsible "System checks" rail**
Payslip parity, email dispatch, roster completeness, RazorpayX orphans, ERP accounts, ghost-email residual, statutory drift and unknown enrollment all move into one accordion-style rail. Each entry shows a one-line status row (icon + label + count + green/amber/red dot); healthy ones stay collapsed, ones with issues auto-expand and render exactly the existing panel content and buttons. No panel is removed, and every existing action (Derive from history, Import Register, Show ignored, User Management, etc.) stays where it is inside its expanded panel.

**4. Drift rows made scannable**
Each row keeps the same data and buttons but is restructured:
- Line 1: severity dot + field label + employee name + badge ID + status chips (inactive, dismissal pending).
- Line 2: value comparison rendered as a single inline `HRMS → Razorpay → eSSL` strip with the differing values highlighted, instead of three boxed columns eating a third of the row each. Empty systems collapse out rather than rendering an empty box.
- Push-failure alerts keep their dedicated note treatment with the IST timestamp.
- Actions right-aligned: the primary action (Push → Razorpay / Dismiss in RazorpayX) stays a visible button; "Pull ← Razorpay", "Push → eSSL device" / "Remove from eSSL device" and "Mark resolved" move into a compact overflow menu on desktop-narrow widths but stay visible as buttons at wide widths. All confirm dialogs, tooltips and handlers are untouched.
- Rows group under sticky sub-headers by employee when more than one drift belongs to the same person, so a person with four drifts reads as one block.

**5. Token cleanup**
Replace the hardcoded `#E8604C` / `#d04e3c` / `text-white` usages on this page with the existing semantic tokens so the page themes correctly in dark mode, matching the rest of HRMS.

## Explicitly unchanged

- All queries, RPCs, edge-function calls, push/pull/resolve logic, confirm dialogs and toasts.
- URL params (`employee`, `unexplained`) and their behaviour.
- The set of visible information — nothing is dropped, only re-ranked and collapsed by default when healthy.

## Technical notes

- Files: `src/pages/horilla/DataHealthPage.tsx` (layout + rows), plus presentational-only tweaks in `src/components/hrms/health/PayrollHealthTiles.tsx`, `RazorpayOrphanPanel.tsx`, `ErpAccountHealthPanel.tsx` so they render as rail rows rather than standalone cards.
- New local sub-components inside the page: `HealthRailItem`, `DriftRow`, `CounterPill`. No new hooks or data fetching.
- Uses existing shadcn `Select`, `Collapsible`, `DropdownMenu`, `Badge`; no new dependencies.
- Verification: typecheck + build, then a Playwright pass at 1440px and 1024px capturing the page to confirm no overflow and that filters/counters still drive the same filtered set.
