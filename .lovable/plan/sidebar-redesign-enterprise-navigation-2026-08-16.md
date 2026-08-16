# Sidebar Redesign — Enterprise Navigation

Frontend/presentation only. No changes to routes, permissions, drag-order persistence, PIN protection, or data.

## Structure (unchanged behaviour, cleaner hierarchy)

- Keep the single reorderable list — no new fixed labeled sections.
- Re-align items by their existing group hierarchy: standalone modules render as flat rows; collapsible groups render as a parent row with an indented child block and a hairline guide rail down the left of the children.
- Add breathing room between top-level blocks (8px between rows, 16px around each collapsible group) instead of uniform tight spacing.
- Collapsible group headers become the "group label" affordance: uppercase, 11px, letterspaced, muted — only when a group is expanded, so quiet groups read as plain rows.

## Visual language

- One icon library only (lucide-react), all icons at 16px (18px for the pinned Profile and Terminal).
- Remove the per-item colored icon tiles (`bgColor`/`color`) from the resting state — non-active rows become visually quiet: muted icon, normal-weight text, transparent background.
- Icon/text alignment: fixed 20px icon column, 10px gap, consistent 36px row height so every label starts on the same x-axis.
- Active state: subtle Blynk blue tint background, primary-blue icon, semibold text, and a 2px rounded accent bar pinned to the left edge of the row.
- Hover: soft `sidebar-accent` background + slight text lift, 120ms transition, no border/shadow jump.
- Parent group with an active child gets a muted "contains active" treatment (blue icon only, no full fill) so it doesn't compete with the real active row.

## Truncation

- Long module names wrap to a second line at 12px rather than clipping mid-word; hard truncation only past two lines, with the full title as a native tooltip.

## Collapsed mode

- Stays `collapsible="icon"`. Icons centered in a 36px square, active row keeps the blue tint plus the left accent bar.
- Tooltips on every item (already wired via `SidebarMenuButton tooltip`), extended to collapsible group parents and the Terminal action.
- Collapsible groups do not expand inline when collapsed; clicking navigates via tooltip-labelled flyout behaviour already provided by the sidebar primitive.

## Top and bottom

- Header keeps the Blynk identity: full logo expanded, icon mark collapsed, on a calmer surface (sidebar background + bottom hairline) instead of the solid primary block, so it stops fighting the page.
- Footer gets a real user block: avatar (initials fallback), display name, role/designation beneath, whole row links to `/profile`. Collapsed mode shows just the avatar with a tooltip.
- Terminal action sits above the user block: distinct but compact — 32px high, warning-tinted text/icon on a quiet surface with a thin warning border, not a large filled button.
- Copyright line drops to a single muted 10px line; collapse toggle moves next to the user row.

## Scrolling and content separation

- Smooth momentum scrolling with a thin auto-hiding scrollbar; header and footer stay pinned while only the nav list scrolls.
- Sidebar surface stays one flat neutral tone with a single 1px border and no shadow, so it recedes behind the main content.

## Technical notes

- Files: `src/components/AppSidebar.tsx` (header, footer, spacing, user block, Terminal), `src/components/DraggableSidebarItem.tsx` (row anatomy, active/hover states), `src/components/sidebar/CollapsibleSidebarGroup.tsx` (group header label, child rail, indentation), `src/index.css` (new `.ds-nav-row`, `.ds-nav-row-active`, `.ds-nav-label`, scrollbar utility).
- Row styling centralised in shared CSS utilities so item and group children stay identical.
- Item `color`/`bgColor` fields stay in the data model (drag/persistence untouched) but are no longer used for resting-state chrome.
- User name/role read from the existing auth/profile hook already imported in `AppSidebar.tsx`; no new queries.
- Verification: typecheck, then Playwright screenshots of expanded and collapsed states with an active route to confirm alignment, active indicator and tooltips.
