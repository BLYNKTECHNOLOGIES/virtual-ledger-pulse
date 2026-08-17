# Terminal Light Theme — Blynk Exchange Identity

A light mode for the trading terminal that carries Blynk's brand identity (indigo/blue primary, Inter, restrained enterprise surfaces) rather than copying Binance. It still reads as a professional exchange terminal: dense rows, mono numerics, unambiguous buy/sell colour semantics.

## Visual direction

- Canvas: soft cool paper (`#F7F9FC`), not pure white — reduces glare on long trading sessions.
- Panels: pure white cards with hairline cool-grey borders and very low-elevation shadows; sidebar a shade deeper than canvas for structure.
- Accent: Blynk indigo-blue (matching ERP primary family) instead of the dark theme's electric cyan and instead of Binance amber. Focus rings, active nav, links and selected rows all use it.
- Trading semantics: buy/sell green and red retuned for light backgrounds (darker, higher contrast, AA on white); pending amber darkened so it stays legible.
- Data density and typography unchanged — same row heights, same tabular/mono numerics, same uppercase micro-labels. Light mode changes colour only, never layout.
- Signature glow, grid texture and shimmer effects are re-expressed for light (subtle tinted washes instead of neon glows) so nothing looks like a dark-theme leftover.

## Switching

- Own terminal toggle (sun/moon) in the terminal header, independent of the ERP theme, remembered in `localStorage` under `blynk-terminal-theme`, default dark.
- Terminal theme applies only inside the terminal wrapper — zero bleed into ERP pages.

## Technical work

1. `src/contexts/TerminalThemeContext.tsx` — provider with `theme`/`setTheme`/`toggle`, localStorage persistence, applies `t-light` / `t-dark` class on the existing `.terminal` wrapper element.
2. `src/index.css` — add a `.terminal.t-light` token block overriding every variable defined in the current `.terminal` block (backgrounds, card, popover, primary, muted, accent, border, input, ring, success/warning/destructive, trade-buy/sell/pending, chart 1–5, sidebar tokens, shadows, glow). Also add light variants for the scoped rules that currently hardcode dark values: scrollbar track/thumb, `thead`/`tbody` row and hover backgrounds, `.t-panel`, `.t-glow`, `.t-grid-bg`, `.t-shimmer`, flash-up/flash-down and pulse keyframe colours.
3. `TerminalHeader.tsx` — add the theme toggle button next to notifications, matching existing header icon-button sizing.
4. Wrap the terminal layout with the provider and bind the theme class where `.terminal` is applied.
5. Sweep terminal components for hardcoded palette utilities (`text-white`, `bg-black`, `bg-zinc-*`, `text-slate-*`, inline hex) — roughly 9 files plus scoped CSS — and replace with semantic tokens so both themes resolve correctly.
6. Verify with Playwright across the terminal routes (Dashboard, Orders, Ads, Chat, KYC, Users, Settings, Analytics) in light mode: screenshot each, check header/icon/badge contrast and that no panel, tooltip, dropdown or chart renders as a dark island.

## Out of scope

- No layout, data, or Binance API behaviour changes.
- ERP theme tokens untouched.
