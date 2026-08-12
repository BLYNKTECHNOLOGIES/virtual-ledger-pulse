# Persistent HRMS shell + perceived-speed pass

## The problem (verified)

Every HRMS page is a lazily-loaded module, but the only `<Suspense>` boundary in the app wraps the **entire router** in `App.tsx`. So when you click a sidebar link, the page module suspends, React unmounts everything above it too, and the whole screen is replaced by a centered spinner on a blank background (`RouteFallback`) — sidebar, header and all. That is why navigation feels like a full page reload.

Second-order effect: after the module lands, each page starts its own data fetch and renders another spinner, so you often wait through two blank states back to back.

## What changes

### 1. The shell never unmounts
Move the loading boundary inside the HRMS layout, around the `<Outlet />` only. Sidebar, header and scroll chrome stay mounted and interactive during navigation; only the right-hand content region swaps. This applies on desktop whether the sidebar is expanded or collapsed, and on mobile the behaviour is unchanged.

### 2. Content-shaped placeholders instead of a spinner
The content region gets a skeleton that matches the page family it is loading (list pages get a table skeleton, dashboards get card tiles, detail pages get a header + panel block) rather than a lone spinner. Same footprint as the real content, so nothing jumps when data arrives.

### 3. A thin progress bar at the top of the content area
A slim indeterminate bar appears under the header while a route is loading and finishes when the page is ready — the standard "something is happening, it is not stuck" cue, without covering content.

### 4. Instant navigation feedback
The clicked sidebar item highlights immediately on click, so the nav responds before the new page has loaded.

### 5. Prefetch on intent
Hovering (or focusing) a sidebar link starts downloading that page's JavaScript chunk in the background. By the time the click happens the module is usually already in memory, so many navigations become instant with no loading state at all.

### 6. Keep previous data while refetching
When a page refetches (filter change, month change, background refresh) the already-rendered content stays on screen with a subtle "updating" cue instead of collapsing back to a skeleton.

## What explicitly does NOT change

No optimistic writes. Every create/update/delete keeps waiting for the real server confirmation before the UI treats the value as saved: the button shows a pending state and stays disabled, and the row/list only reflects the new value after the database responds. Failures surface as errors, not as silently-reverted rows. This work is presentation-only — no mutation, business-logic, or backend behaviour is touched.

## Technical notes

- `src/components/horilla/HorillaLayout.tsx`: wrap `<Outlet />` in a `<Suspense>` with a content-region fallback; keep the existing flex/scroll structure so the sidebar and header render outside the boundary.
- New `src/components/horilla/HrmsRouteFallback.tsx`: skeleton chosen from the pending pathname (list / dashboard / detail shapes) using existing `Skeleton` primitives and semantic tokens.
- New `src/components/horilla/RouteProgressBar.tsx`: driven by `useNavigation()` from react-router; renders a 2px bar pinned under the header.
- New `src/lib/hrmsPrefetch.ts`: a `path -> () => import(...)` registry sharing the exact same module specifiers used by the `lazy()` calls in `App.tsx` (so Vite dedupes to one chunk), invoked from `onMouseEnter`/`onFocus` in `HorillaSidebar`, memoised to fire once per path.
- `src/components/horilla/HorillaSidebar.tsx`: add the prefetch handlers and immediate active-state highlight on click.
- Query layer: set `placeholderData: keepPreviousData` on the list/report queries inside the HRMS pages that currently blank out on filter changes; no change to `useMutation` behaviour anywhere.
- The root `<Suspense fallback={<RouteFallback />}>` in `App.tsx` stays as the outer safety net for non-HRMS routes.
