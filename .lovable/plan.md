# Terminal Sidebar: ERP-style collapse + identifiable icon rail

## Current state (verified)

- `src/components/terminal/TerminalSidebar.tsx` renders a plain `<Sidebar>` with **no** `collapsible="icon"`, so it has no icon rail at all — it can only be hidden entirely.
- Icons are tiny (`h-3.5 w-3.5`), unpadded, mostly monochrome, and several repeat (Audit Logs and Logs both use `ScrollText`). Collapsed they would be near-impossible to tell apart.
- No tooltips on nav items, so a collapsed rail would be unlabelled.
- `src/components/terminal/TerminalLayout.tsx` wraps `<TerminalSidebar />` in a bare `hidden md:block` div — no hover-peek handlers, no work-area ref.
- The ERP system already exists and works: `useSidebarAutoCollapse` (collapse on work-area interaction/scroll, hover-to-peek, manual toggle pins, resets per route) + `Layout.tsx` wiring + `.ds-nav-row` / `.ds-nav-icon` / peek CSS in `src/index.css`.

## Part 1 — Icon redesign (done first)

Give every terminal nav item a **distinct, colour-coded icon chip**, reusing the ERP `ds-nav-row` / `ds-nav-icon` anatomy so both shells look like one product:

- Icon size up from 14px to 18px inside a 28px rounded chip with a subtle tinted background.
- Each module gets its own hue from existing terminal/semantic tokens (no hardcoded hex): e.g. Dashboard neutral, Ads Manager primary, Orders buy/pending accent, Automation accent, Assets wallet-green, Analytics/MPI info-blue, Audit Logs & Logs muted (and de-duplicated — Logs moves to a distinct icon such as `Terminal`/`FileClock`), Payer & Small Payments payment-tone, Appeals warning, KYC Team info, Users/Settings/Shortcuts neutral.
- Resolve all duplicate icons so no two rail glyphs are identical.
- Active state: primary tint on chip + the existing left indicator bar, preserved in collapsed mode.
- Count badges (Orders / Payer / Appeals) become a small dot-badge anchored to the chip's top-right when collapsed, instead of disappearing.

## Part 2 — Collapsible rail, same model as ERP

- Add `collapsible="icon"` to the terminal `<Sidebar>`; render an icon-only header (Blynk mark) and an icon-only ERP Dashboard footer button when collapsed.
- Add `tooltip={title}` on every `SidebarMenuButton` so the collapsed rail is fully labelled on hover.
- Scroll container gets the ERP `ds-nav-scroll` treatment (scrollable, no visible scrollbar) so the rail behaves like the ERP one.

## Part 3 — Layout wiring (identical behaviour to ERP)

- `TerminalLayout.tsx`: add a `workAreaRef` on `<main>`, call `useSidebarAutoCollapse(workAreaRef)`, and wrap the sidebar div with `data-sidebar-peek`, `onMouseEnter`, `onMouseLeave` — exactly as `Layout.tsx` does.
- Wrap `SidebarProvider` with the same cookie-backed `defaultOpen` so the collapsed/expanded choice persists across reloads.
- Mobile (<768px) is unchanged: the existing header toggle / sheet behaviour stays; the auto system is already disabled on mobile inside the hook.

## Technical notes

- Files touched: `src/components/terminal/TerminalSidebar.tsx`, `src/components/terminal/TerminalLayout.tsx`, and a small terminal-scoped block appended to `src/index.css` for the chip tints. No hook changes — `useSidebarAutoCollapse` is reused as-is.
- All colours come from existing tokens (`--primary`, `--trade-*`, `--warning`, `--success`, `--info`, sidebar tokens); nothing hardcoded, and both terminal dark and `.terminal.t-light` themes are covered.
- Verification with Playwright at 1280px: land on `/terminal/ads`, click into the work area → rail collapses; hover rail → peeks open over content without reflowing the page; mouse out → re-collapses; click the header toggle → choice pins; screenshot the collapsed rail to confirm every icon is distinct and badges are visible. Then re-check at 390px that mobile is untouched.
