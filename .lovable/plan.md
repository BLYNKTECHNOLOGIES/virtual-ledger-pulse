
# ERP - Terminal Integration: Purchase Sync and Client Linkage

## Overview
Build a bridge between the Terminal (Binance P2P trading) and the ERP (Purchase Management) so that every completed BUY order on the Terminal automatically creates a draft purchase entry in the ERP for human approval. This includes wallet linking, client auto-mapping, PAN collection in Terminal, and duplicate protection.

---

## Phase 1: Database Schema (New Tables and Columns)

### 1.1 `terminal_wallet_links` table
Maps ERP wallets to terminal platforms so the system knows where to post inventory.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| wallet_id | uuid FK(wallets) | ERP wallet being linked |
| platform_source | text | e.g. 'terminal', future: 'manual' |
| api_identifier | text | e.g. 'binance_p2p' |
| supported_assets | text[] | e.g. {'USDT'} |
| status | text | 'active' or 'dormant' |
| created_at / updated_at | timestamptz | |

Pre-seed: Link "BINANCE BLYNK" wallet as the active terminal wallet.

### 1.2 `terminal_purchase_sync` table
Tracks every completed BUY order sync event from Terminal to ERP.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| binance_order_number | text UNIQUE | Duplicate protection key |
| purchase_order_id | uuid FK(purchase_orders) nullable | Linked after approval |
| sync_status | text | 'synced_pending_approval', 'approved', 'rejected', 'duplicate_blocked', 'client_mapping_pending' |
| order_data | jsonb | Snapshot of terminal order data |
| client_id | uuid FK(clients) nullable | Matched/created client |
| counterparty_name | text | Verified seller name |
| pan_number | text nullable | From counterparty PAN record |
| synced_by | uuid nullable | |
| synced_at | timestamptz | |
| reviewed_by | uuid nullable | |
| reviewed_at | timestamptz | |
| rejection_reason | text nullable | |
| created_at | timestamptz | |

### 1.3 `counterparty_pan_records` table
Stores PAN details per counterparty nickname (collected in Terminal).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| counterparty_nickname | text UNIQUE | Binance nickname |
| pan_number | text | PAN value |
| collected_by | uuid nullable | |
| created_at / updated_at | timestamptz | |

### 1.4 Add `source` and `terminal_sync_id` columns to `purchase_orders`
- `source` text DEFAULT 'manual' -- values: 'manual', 'terminal'
- `terminal_sync_id` uuid FK(terminal_purchase_sync) nullable

---

## Phase 2: Wallet Linking Configuration (ERP Side)

### 2.1 New "Terminal Wallet Link" section in Stock Management > Wallets tab
- Add a card/section inside `WalletManagementTab` showing terminal-linked wallets
- "Link Terminal Wallet" button opens a dialog to select a wallet and configure:
  - Platform Source (dropdown: Terminal)
  - API Identifier (text: binance_p2p)
  - Supported Assets (multi-select: USDT)
  - Status toggle (Active/Dormant)
- Display currently linked wallets with status badges
- Only one wallet can be "active" per platform at a time

### 2.2 Terminal Settings - Platform Display
- Add a "Connected Platform" card in Terminal Settings showing:
  - Platform: Binance P2P
  - Linked Wallet: (fetched from terminal_wallet_links)
  - Status: Active/Dormant
  - Read-only display for operators

---

## Phase 3: Auto-Sync Completed BUY Orders

### 3.1 Sync Trigger Logic
When the order sync runs (`useBinanceOrderSync`), after upserting orders to `binance_order_history`:
- Query for BUY orders with status COMPLETED that are NOT yet in `terminal_purchase_sync`
- For each new completed BUY order:
  1. Check duplicate: if `binance_order_number` exists in `terminal_purchase_sync`, mark as 'duplicate_blocked'
  2. Look up `counterparty_pan_records` for PAN by nickname
  3. Try to match counterparty verified name against `clients.name` (case-insensitive exact match)
  4. Insert into `terminal_purchase_sync` with status 'synced_pending_approval' (or 'client_mapping_pending' if no client match)
  5. Snapshot `order_data`: order_number, asset, amount (quantity), total_price, unit_price, commission, counterparty verified name, create_time, pay_method

### 3.2 Data extracted per order (from `binance_order_history` + enriched `verified_name`)
- Order Number
- Asset (treated as Product = USDT)
- Quantity (amount field)
- Total Fiat Amount (total_price)
- Price Per Unit (unit_price)
- Commission/Fee (commission field)
- Counterparty Verified Name (verified_name from enrichment, or counter_part_nick_name fallback)
- Completion Timestamp (create_time)
- Wallet (from terminal_wallet_links active wallet)

---

## Phase 4: ERP Purchase Approval Queue

### 4.1 New "Terminal Sync" tab in Purchase Management
Add a 5th tab in the Purchase page called "Terminal Sync" with a badge counter.

Display a table of `terminal_purchase_sync` records with columns:
- Binance Order #, Seller Name, Amount (INR), Qty (USDT), Price, Fee, Status, Synced At
- Status badges: Pending Approval (amber), Approved (green), Rejected (red), Duplicate (gray), Client Mapping Pending (blue)
- Filter by status

### 4.2 Approval Dialog (Reuses ManualPurchaseEntryDialog pattern)
When user clicks "Approve" on a pending sync record:
- Open a dialog pre-filled with terminal data
- **Read-only fields** (locked with visual indicator): Order Number, Price Per Unit, Quantity, Total Amount, Commission/Fee, Wallet, Seller Verified Name
- **Editable fields**: TDS Option (auto-suggested: 1% if PAN exists, 20% if not), PAN Number (pre-filled from counterparty_pan_records), Bank Account for deduction, Settlement Date, Remarks
- Client auto-mapping section:
  - If matched: show linked client name with "Linked" badge
  - If not matched: show "Create Client" inline button that creates a client with verified name as legal name, source tagged as 'Terminal Counterparty', is_seller = true
- On submit: calls the existing `create_manual_purchase_complete_v2` RPC with terminal data, updates `terminal_purchase_sync` status to 'approved', links purchase_order_id

### 4.3 Reject Action
- Opens a small dialog for rejection reason
- Updates sync record status to 'rejected'

---

## Phase 5: PAN Collection in Terminal

### 5.1 PAN Input in Counterparty Profile (OrderDetailWorkspace)
In the `CounterpartyProfile` component (right panel of order workspace):
- Add a PAN Details section below the trading stats
- Input field for PAN number with save button
- Fetches existing PAN from `counterparty_pan_records` by nickname
- On save: upserts to `counterparty_pan_records`
- Visual indicator when PAN is already stored (green check)
- PAN syncs to ERP client master: when a client is linked to this counterparty, update `clients.pan_card_number`

---

## Phase 6: Fee Configuration

### 6.1 Fee Handling Config
Add a setting in `terminal_wallet_links`:
- `fee_treatment` column: 'capitalize' (add to inventory cost) or 'expense' (book separately)
- Default: 'capitalize' (commission added to purchase cost)
- During approval, the commission from Binance is displayed and included in the total cost calculation based on this setting

---

## Phase 7: Audit Logging

All sync events logged to `system_action_logs`:
- TERMINAL_ORDER_SYNCED
- TERMINAL_ORDER_APPROVED  
- TERMINAL_ORDER_REJECTED
- TERMINAL_DUPLICATE_BLOCKED
- TERMINAL_CLIENT_CREATED

---

## Technical Implementation Sequence

1. Database migration: Create 3 new tables + alter purchase_orders
2. Build `WalletLinkingSection` component for ERP Stock Management
3. Build `PlatformDisplayCard` for Terminal Settings
4. Build `CounterpartyPanInput` component for Terminal order workspace
5. Build sync logic in `useBinanceOrderSync` post-sync hook
6. Build `TerminalSyncTab` component for Purchase page
7. Build `TerminalPurchaseApprovalDialog` component
8. Wire up client auto-mapping and PAN-based TDS suggestion
9. Add audit logging throughout
10. Add permission gate (purchase_manage required for approval)

---

## What Will NOT Be Built (API Limitations Respected)
- No fabrication of banking/tax data from Binance API
- Commission comes directly from Binance order data (the `commission` field)
- Verified name uses the enrichment system already built (Enrich from API)
- All statutory fields (TDS, bank allocation, compliance) remain ERP-controlled during approval
