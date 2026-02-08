# P2P Order Management Terminal — Build Plan

## Overview

A standalone P2P Order Management Terminal at `/terminal/*` routes, coexisting with the current website. Designed as an institutional trading desk UI for managing Binance P2P operations.

---

## API Capabilities (Per C2C SAPI v7.4)

### ✅ Fully Supported
- **Ads**: CRUD, status toggle, reference price, search, categories
- **Orders**: List active, list history, get detail, place order
- **Order Actions**: Mark as paid, release crypto (2FA), cancel order
- **Chat**: Retrieve messages (paginated), WSS real-time credentials, image upload (pre-signed URL), mark read
- **Counterparty**: Query order statistics per counterparty
- **Payment Methods**: List all, get by ID, get by user ID
- **Merchant**: Online/offline toggle, start/end rest, close/start business
- **User**: Get user detail, order summary

### ⚠️ Genuinely Limited
- **Appeal management**: No file/respond/resolve endpoints
- **Payment details**: Hidden after 90 days or for cancelled orders
- **Counterparty KYC level**: Not in any response schema
- **Order status webhooks**: Must poll (chat has WSS)

---

## Phase 1: Foundation ✅ DONE

- [x] Terminal dark theme CSS tokens (`.terminal` scope in index.css)
- [x] Trading semantic colors: `--trade-buy`, `--trade-sell`, `--trade-pending`
- [x] `TerminalLayout`, `TerminalSidebar`, `TerminalHeader` components
- [x] Dashboard page with metric cards + quick access
- [x] `/terminal` and `/terminal/ads` routes wired in App.tsx
- [x] Ad Manager page restyled with semantic design tokens

## Phase 2: Dashboard ✅ DONE

- [x] Real-time metric cards from Binance order history
- [x] Time period filters (Today, 7d, 30d)
- [x] Trade volume chart (Recharts)
- [x] Ad performance widget
- [x] Operational alerts widget

## Phase 3: Orders + Repeat Detection ✅ DONE

- [x] Orders table with Binance sync
- [x] 3-panel order detail workspace (summary | chat | counterparty)
- [x] Repeat client detection via nickname matching
- [x] CounterpartyBadge component (First Order, Repeat, High Frequency)
- [x] Past interactions panel
- [x] Chat persistence with local DB
- [x] **Order Actions**: Mark as Paid, Release Crypto (2FA), Cancel Order
- [x] **Binance Chat Integration**: Read real messages from Binance API
- [x] **Counterparty Stats**: Live stats from queryCounterPartyOrderStatistic API
- [x] **Active Orders**: listOrders endpoint for in-progress orders
- [x] Payment methods endpoint fixed (GET method)

## Phase 4: Chat & Media (Next)

- [ ] WebSocket real-time chat via retrieveChatCredential
- [ ] Image upload via pre-signed URL flow
- [ ] Quick message templates (local only)
- [ ] Chat notification indicators

## Phase 5: Automation

- [ ] Auto-reply workflow builder
- [ ] Triggers: order received, payment marked, timer breach
- [ ] Merchant online/offline scheduling

## Phase 6: User Sync & Permissions

- [ ] Identity-level sync from parent website
- [ ] Local role architecture with granular permissions
- [ ] Permission-gated UI

---

## Design Language

- Institutional trading desk aesthetics (not retail/gaming)
- Deep neutral base: charcoal, graphite, muted slate
- Trading semantics: green=buy/complete, red=sell/dispute, amber=pending
- Clean sans-serif, data-dense tables, subtle row separators
- Compact spacing, tabular numbers, financial prominence for rates/quantities
