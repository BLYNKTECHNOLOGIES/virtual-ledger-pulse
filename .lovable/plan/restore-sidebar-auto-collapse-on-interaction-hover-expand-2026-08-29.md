# Restore Sidebar Auto-Collapse on Interaction + Hover-Expand

## Current state (verified)
- `src/hooks/useSidebarScrollCollapse.ts` only collapses the sidebar when the user **scrolls down** past 80px in the main work area, and re-expands at scroll top. There is no collapse-on-interaction and no hover-expand — that behavior is no longer wired anywhere (`AppSidebar.tsx` has no mouse-enter/leave handlers; `Layout.tsx` only mounts the scroll hook).
- `Layout.tsx` renders `<AppSidebar />` inside a plain `hidden md:block` div and the work area in `MainWorkArea`.

## What we'll build

### 1. New `useSidebarAutoCollapse` hook (replaces/merges the scroll-only hook)
Desktop only (skips mobile + standby users, who don't see the sidebar):
- **Collapse on interaction:** first `pointerdown`/`click` inside the main work area collapses the sidebar to the icon rail. Subsequent interactions don't re-trigger.
- **Expand on hover:** moving the cursor onto the sidebar (even the collapsed icon rail) expands it. Moving the cursor back out re-collapses it — but only if the collapse was automatic.
- **Manual toggle always wins:** clicking the sidebar trigger pins the user's choice; the auto system stops fighting until the next page navigation.
- Keep the existing scroll-collapse as a secondary trigger (scroll down past threshold also collapses), so long pages still free up space.
- Expand-on-hover temporarily overlays the expanded sidebar above content (or pushes content smoothly) with a single CSS transition — no layout jump/flicker.

### 2. Layout wiring
- `Layout.tsx`: wrap `AppSidebar` in a container with `onMouseEnter`/`onMouseLeave` bound to the hook; pass the work-area ref for interaction detection.
- Smooth width transition on the sidebar container so collapse/expand animates cleanly instead of snapping.

### 3. UI refinement + responsiveness
- Icon rail: consistent icon alignment, tooltips on collapsed items (shadcn `SidebarMenuButton` tooltips), active-route highlight preserved in collapsed state.
- No content shift jank: work area uses flex `min-w-0` (already present) plus a transition on sidebar width.
- Mobile unchanged: bottom nav + sheet sidebar behavior untouched; auto system fully disabled under the `md` breakpoint.

## Technical details
- Files: new `src/hooks/useSidebarAutoCollapse.ts`; edits to `src/components/Layout.tsx`; remove `useSidebarScrollCollapse` usage (folded into the new hook); minor polish in `src/components/AppSidebar.tsx` only if needed for rail alignment.
- State model: `mode: "pinned-open" | "pinned-closed" | "auto"` ref inside the hook; auto mode collapses on content interaction / scroll, hover temporarily expands.
- Uses existing `useSidebar()` context (`open`, `setOpen`) — cookie persistence of manual state stays as-is.
- Verify with Playwright: click into a page → sidebar collapses; hover rail → expands; mouse out → collapses; manual trigger pins; mobile viewport unaffected.
