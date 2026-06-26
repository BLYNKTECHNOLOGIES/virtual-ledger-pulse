## Goal

Make the ERP feel finished and polished instead of "raw Excel sheet" by adding subtle, fast micro-animations — without changing any tab positions, page layouts, data, or business logic. All changes happen in shared UI primitives and one global CSS/config file, so every page benefits at once.

## Guardrails (hard constraints)

- No placement changes to tabs or any UI element. Only motion/transition styling is added.
- No business-logic, data, query, or backend changes.
- Performance-first: only GPU-friendly properties (`transform`, `opacity`), durations capped at 150–250ms, and respect `prefers-reduced-motion` so heavy data tables never feel laggy.
- Everything stays in the existing design-token system (no hardcoded colors).

## What gets polished

### 1. Dialogs & modals (the biggest "raw" feeling)
`src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `drawer.tsx`
- Add a smooth zoom+fade entrance on mobile too (currently only desktop zooms; mobile just fades).
- Soften overlay fade and add a gentle backdrop blur on open.
- Slightly longer, eased close so dialogs don't "snap" shut.

### 2. Tab switching
`src/components/ui/tabs.tsx`
- Add a quick fade/slide-up on `TabsContent` when a tab becomes active (content animates, tabs stay exactly where they are).
- Smooth the active-pill transition on `TabsTrigger` (color/shadow already transitions; refine easing).

### 3. Tables (kills the "spreadsheet" feel)
`src/components/ui/table.tsx`
- Subtle row hover lift/tint refinement and smoother `transition-colors`.
- Optional staggered fade-in for newly rendered rows (CSS-only, no JS per-row cost).

### 4. Cards, dropdowns, popovers, tooltips, accordions
`card.tsx`, `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `hover-card.tsx`, `tooltip.tsx`, `accordion.tsx`
- Ensure consistent enter/exit zoom+fade (most already have it via radix; standardize duration/easing).
- Cards: gentle hover elevation using existing shadow tokens.

### 5. Buttons & interactive controls
`src/components/ui/button.tsx`
- Add subtle active-press scale (`active:scale-[0.98]`) and consistent transition for a tactile feel.

### 6. Global motion foundation
`tailwind.config.ts` + `src/index.css`
- Add a small set of reusable keyframes/utilities (e.g. `fade-in-up`, `content-show`) with standardized easing curve.
- Add a global `@media (prefers-reduced-motion: reduce)` block that disables/reduces animations for accessibility and low-power devices.
- Add a route/page-content mount fade so navigating between modules feels intentional.

## Approach

Because all interactive UI is built on these shared primitives, editing them propagates the polish across every module (Sales, Terminal, BAMS, Accounting, Approvals, etc.) with zero per-page edits and zero placement changes.

## Verification

- Build passes.
- Drive Playwright on the live preview to open a dialog, switch tabs, and hover table rows; capture before/after screenshots and confirm motion is subtle and tabs/layout are unchanged.
- Confirm reduced-motion media query disables animations.

## Technical notes

- Durations: 150ms (hover/press), 200ms (dropdowns/tabs), 250ms (dialogs). Easing: `cubic-bezier(0.16,1,0.3,1)` for entrances.
- Only animate `transform`/`opacity`/`filter`(blur on overlay only) to avoid layout reflow and keep 60fps on large tables.
- No changes to any `*Tab.tsx` page files, sidebar, or routing structure beyond an opt-in mount-fade wrapper.
