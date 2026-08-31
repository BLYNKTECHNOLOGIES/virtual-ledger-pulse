# HRMS: same auto-collapse / hover-peek sidebar as ERP and Terminal

## Current state (verified)

- ERP (`Layout.tsx`) and Terminal both use shadcn `SidebarProvider` + `useSidebarAutoCollapse` (`src/hooks/useSidebarAutoCollapse.ts`): interacting with or scrolling the work area collapses the rail, hovering the rail peeks it open as an overlay, the manual toggle pins the choice, and route changes reset to auto. The peek overlay is styled by `[data-sidebar-peek="true"]` rules in `src/index.css`.
- HRMS is different: `HorillaLayout.tsx` holds its own `sidebarCollapsed` boolean and `HorillaSidebar.tsx` is a hand-rolled `<aside>` (fixed `w-[240px]` / `w-[68px]`, hardcoded `#1a1a2e` / `#6C63FF` colours, no shadcn sidebar context). There is no auto-collapse, no hover-peek, and no persistence — only the manual Collapse button.
- Collapsed mode already has a flyout submenu on hover (`hoveredItem`), which will need to coexist with the new peek.
- The attached screenshot shows the current glitch: the expanded sidebar overlaps the work area and the group list is clipped/misaligned during the transition.

## What we'll build

### 1. Shared auto-collapse behaviour for HRMS
A small HRMS-scoped hook mirroring `useSidebarAutoCollapse` but driving `HorillaLayout`'s own `collapsed` state (HRMS has no shadcn sidebar context):

- Collapse on first pointerdown / keydown inside the `<main>` work area, and on scroll past ~80px.
- Hover the rail → expand as a **peek overlay** (sidebar is absolutely positioned over the content at 240px while the 68px rail spacer stays in place, so the page never reflows).
- Mouse leave → re-collapse, with the same hover-intent delays (90ms in / 200ms out) to prevent flicker.
- Manual Collapse button pins the choice; auto stops fighting until the next route change.
- Disabled on mobile (`useIsMobile`) — the existing sheet/overlay behaviour is untouched.

### 2. Layout wiring
- `HorillaLayout.tsx`: add a `workAreaRef` on `<main>`, call the hook, wrap the sidebar in a peek container with `onMouseEnter` / `onMouseLeave` and a fixed-width spacer so collapse/expand animates without shifting content.
- Persist collapsed/expanded across reloads with a cookie, matching the ERP `sidebar:state` pattern (separate key `hrms-sidebar:state`).

### 3. Polish so it isn't glitchy
- Single width transition on the rail (`transition-[width] duration-200 ease-out`), no competing transitions; peek uses transform/width on the overlay only.
- Collapsed rail: centred icons, group titles hidden, active highlight preserved, tooltip/flyout for items without children (currently only items with children get a flyout).
- Nav scroll container gets the ERP `ds-nav-scroll` treatment (scrollable, hidden scrollbar) so the rail matches ERP and the clipped-list artifact in the screenshot goes away.
- Labels fade rather than pop when the rail widens.

## Technical details

- New `src/hooks/useHrmsSidebarAutoCollapse.ts` (same state model: `mode: "auto" | "pinned"`, `isPeeking` flag, hover timers, route-change reset).
- Edits: `src/components/horilla/HorillaLayout.tsx` (ref + wiring + spacer), `src/components/horilla/HorillaSidebar.tsx` (peek/overlay classes, rail polish, scroll container).
- Small HRMS-scoped CSS block appended to `src/index.css` for the peek overlay (`[data-hrms-sidebar-peek="true"]`), reusing the ERP approach.
- No changes to nav structure, permissions, routes, or any HRMS data logic — presentation only.
- Verification with Playwright at 1280px: land on `/hrms/requests`, click into the table → rail collapses; hover rail → peeks open over content with no reflow; mouse out → re-collapses; click Collapse → pins; screenshot collapsed + peek states. Then re-check at 390px that mobile is unchanged.
