# Terminal Light Theme — Reduce Eye Strain via Softer Contrast

## Problem

The Terminal light theme (`t-light`) currently causes visual fatigue:

- Background is very light (`#F7F9FC`, `218 33% 97%`), almost white.
- Foreground text is very dark (`#1c2333`, `222 32% 14%`), close to ink black.
- The combination produces high contrast/glare, especially on dense order tables viewed for long periods.
- The subtle grid texture, white cards, and muted text also feel harsher than Binance’s softer light UI.

## Goal

Soften the Terminal light theme so it is less strenuous to read for long sessions, while keeping:

- Blynk brand identity (indigo-blue primary).
- Strong readability and accessible contrast (WCAG 4.5:1 for body text).
- Clear distinction between BUY/SELL/status colors.
- Zero impact on the Terminal dark theme or the main ERP theme.

## What will change

### 1. Core palette tuning in `src/index.css`

Adjust the `.terminal.t-light` token block:

```text
Before → After (approximate)
--background:   218 33% 97%  (#F7F9FC) → 220 18% 93%  (#ECEFF4)  slightly dimmer cool paper
--foreground:   222 32% 14%  (#1c2333) → 222 18% 26%  (#363F4D)  softer ink, less black
--heading:      222 36% 12%  (#18202B) → 222 22% 22%  (#2B333F)  headings less harsh
--card:         0 0% 100%    (#FFFFFF) → 0 0% 99%     (#FCFCFD)  near-white, less glare
--muted:        218 30% 95%  (#F1F4F8) → 220 16% 91%  (#E3E7ED)  softer secondary surfaces
--muted-foreground: 220 12% 42% (#5B677A) → 220 10% 46% (#6B7280)  labels slightly lighter
--border:       218 24% 88%  (#D6DDE6) → 220 16% 82%  (#C9CFD8)  visible but calmer edges
--surface-subtle: 220 40% 98% (#F6F8FB) → 220 16% 94%  (#E8EBF0)  aligns with new canvas
--surface-canvas: 218 33% 97% (#F7F9FC) → 220 18% 93%  (#ECEFF4)  matches background
```

Also tune shadows to be softer and less dark on the new paper background.

### 2. Scoped terminal chrome overrides

Update the `.terminal.t-light` overrides for:

- `tbody tr:hover`: use a more subtle indigo/gray tint instead of the current saturated wash.
- `thead tr`: use the new `--surface-subtle` instead of the current bright header.
- `.t-grid-bg`: reduce grid-line opacity by ~30% so the texture is barely perceptible.
- `.t-shimmer`: use the new muted range.
- Scrollbar thumb/track: align with the softened palette.

### 3. Component-level verification

Sweep the Terminal orders page and shared terminal components for any hardcoded light-theme values that would fight the new tokens (e.g., inline `text-slate-900`, `bg-white`, `#` hex values). Replace them with semantic tokens. Focus on:

- `src/pages/terminal/TerminalOrders.tsx` (table rows, cards, filters, command strip).
- `src/components/terminal/orders/*` (card view, badges, chat panels).
- `src/components/terminal/TerminalHeader.tsx` and `TerminalSidebar.tsx`.

### 4. Trading semantics remain crisp

BUY/SELL/status colors are intentionally saturated for quick recognition. They will stay AA-compliant on the new, slightly dimmer paper but will not be muted.

## Out of scope

- No changes to Terminal dark theme (`t-dark`).
- No changes to the main ERP light/dark themes.
- No layout, data, API, or workflow changes.

## Verification

1. Run `npx tsgo --noEmit` to confirm type safety.
2. Build the project and check `build-errors.log`.
3. Use Playwright to capture screenshots of the Terminal Orders page in light theme at 1280×900 and 390×710, comparing before/after contrast.
4. Visually confirm that text no longer feels "too bright" against the background and that BUY/SELL/status colors remain distinct.

## Technical notes

- All changes stay inside the existing `.terminal.t-light` block and its scoped overrides in `src/index.css`.
- No new dependencies or runtime logic.
- Keep semantic token usage so future theme tweaks remain centralized.
