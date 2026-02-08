# P2P Order Management Terminal — Build Plan

## Overview

A standalone P2P Order Management Terminal at `/terminal/*` routes, coexisting with the current website. Designed as an institutional trading desk UI for managing Binance P2P operations.

The current website continues independently. Only selective data interoperability (user identity sync, finance data consumption) bridges the two systems.

---

## Architecture

- **Routes**: `/terminal`, `/terminal/ads`, `/terminal/orders`, `/terminal/automation`, `/terminal/analytics`, `/terminal/settings`
- **Theme**: `.terminal` CSS class scope with dark institutional trading desk aesthetics
- **Layout**: `TerminalLayout` → `TerminalSidebar` + `TerminalHeader` + page content
- **Auth**: Reuses existing `AuthProvider` / `AuthCheck` — user identity synced from parent
- **Permissions**: Local role/permission system (Phase 6) — independent from parent website roles

---

## Phase 1: Foundation ✅ DONE

- [x] Terminal dark theme CSS tokens (`.terminal` scope in index.css)
- [x] Trading semantic colors: `--trade-buy`, `--trade-sell`, `--trade-pending`
- [x] `TerminalLayout`, `TerminalSidebar`, `TerminalHeader` components
- [x] Dashboard page with metric cards + quick access
- [x] `/terminal` and `/terminal/ads` routes wired in App.tsx
- [x] Ad Manager page restyled with semantic design tokens
- [x] Tailwind config extended with `trade-buy`, `trade-sell`, `trade-pending`

---

## Phase 2: Dashboard (Next)

- [ ] Real-time metric cards pulling from Binance / orders data
- [ ] Time period filters (Today, 7d, 30d)
- [ ] Trade volume chart (Recharts)
- [ ] Ad performance breakdown
- [ ] Operator performance metrics
- [ ] Operational alerts widget

---

## Phase 3: Orders Tab

- [ ] Orders table (Binance P2P style)
- [ ] Order detail workspace (3-panel: summary | chat | counterparty)
- [ ] Order types system with quick reply mapping
- [ ] Timer / countdown per order
- [ ] Appeal indicator and handling

---

## Phase 4: Chat & Media

- [ ] Live chat panel in order workspace (text + image)
- [ ] Quick message toggle with predefined templates
- [ ] Image upload and secure storage
- [ ] Binance API message fetch (flag limitations)

---

## Phase 5: Automation

- [ ] Auto-reply workflow builder
- [ ] Triggers: order received, payment marked, timer breach, ad-specific
- [ ] Actions: send message, assign type, notify, escalate
- [ ] API limitation flags for unsupported automations

---

## Phase 6: User Sync & Permissions

- [ ] Identity-level sync from parent website (name, email, credentials, status)
- [ ] Local role architecture with granular permissions
- [ ] Permission-gated UI: tab visibility, ad rights, order handling, chat, etc.
- [ ] Role-specific dashboard views

---

## API Limitation Policy

Any feature outside Binance API capability is flagged as "Out of Binance API Scope" with explanation. No simulated UI, dummy data, or manual overrides for API-dependent features.

---

## Design Language

- Institutional trading desk aesthetics (not retail/gaming)
- Deep neutral base: charcoal, graphite, muted slate
- Trading semantics: green=buy/complete, red=sell/dispute, amber=pending
- Clean sans-serif, data-dense tables, subtle row separators
- Compact spacing, tabular numbers, financial prominence for rates/quantities
