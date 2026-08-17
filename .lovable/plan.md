# Terminal Light Theme

Give the P2P Trading Terminal a first-class light ("exchange white") theme, switched by its own toggle in the terminal header and remembered separately from the ERP theme. Dark stays the default.

## How it works

- A new toggle (sun/moon) sits in the terminal header next to the sound and notification icons.
- The choice is stored under its own key, so the ERP can be dark while the terminal is light, and vice versa.
- The terminal wrapper gets a `t-light` class; every terminal token is redefined for that class, so all pages, dialogs, popovers and charts follow automatically.

## Light palette (Binance-style exchange white)

- Canvas near-white, panels pure white, hairline grey borders, dark slate text with a softer grey for secondary text.
- Accent stays electric blue (darkened slightly for contrast on white).
- Trade semantics stay green/red/amber, retuned so they pass contrast on white instead of glowing on black.
- Charts, sidebar, popovers, inputs, focus rings, and shadows all get light equivalents (soft neutral shadows instead of black ambient ones).

## Audit and fixes

Every terminal page is checked in light mode: Dashboard, Orders (list, detail workspace, chat, past interactions, inbox), Ads Manager, Automation, Assets, Analytics, MPI, Audit Logs, Appeals, Payer, Small Payments, Logs, Users & Roles, Settings, Shortcuts, Operator Detail, Landing, Coming Soon, plus the biometric gate, command palette, alerts, and notification bell.

Known items already identified that will break on white and get fixed:
- Terminal-scoped CSS that hardcodes white/black: table row hover, table cell border, grid-texture background, shimmer skeleton, scrollbar thumb hover.
- Six components using literal `white/…`, `black/…`, or `bg-black` (chat lightbox, chat bubble, order detail workspace, past interactions, chat inbox, sidebar) move to tokens or get light-aware values.
- Nine stray palette utilities (pink/teal 400-500 badges in three files) move to semantic tokens.
- Icons, uppercase micro-labels, panel headers, and status badges are verified to use `text-muted-foreground` / semantic tokens so they invert cleanly.

## Verification

Each terminal route is rendered in light mode in a headless browser and screenshotted; anything with poor contrast or a leftover dark block is corrected before the work is reported done. Dark mode is re-checked afterwards to confirm nothing regressed.

## Technical notes

- `src/index.css`: add a `.terminal.t-light` token block mirroring the existing `.terminal` block; convert the hardcoded overlay values in the terminal component overrides to token-based / theme-aware values.
- New `TerminalThemeContext` (localStorage key `blynk-terminal-theme`, default `dark`) provider added inside `TerminalLayout`, applying the `t-light` class to the terminal wrapper.
- New `TerminalThemeToggle` button rendered in `TerminalHeader`, styled like the existing header icon buttons.
- Presentation-only change: no data, permission, or business-logic edits.
