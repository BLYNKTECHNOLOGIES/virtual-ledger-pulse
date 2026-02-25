

# Payer Module -- Implementation Plan

## Key Clarification
**Payer is at the same hierarchy level (5) as Operator** -- it is a peer role in a different functional department, not a subordinate. Payer handles **BUY order payment execution only**.

---

## 1. Database Changes (Single Migration)

### 1a. Create "Payer" Role
Insert into `p2p_terminal_roles` with `hierarchy_level = 5` (same as Operator), name = `Payer`.

### 1b. New Permissions
Add two new enum values to `terminal_permission`:
- `terminal_payer_view`
- `terminal_payer_manage`

Grant both to the new Payer role.

### 1c. Payer Assignment Table

```text
terminal_payer_assignments
  id              uuid PK default gen_random_uuid()
  payer_user_id   uuid FK -> users(id)
  assignment_type text NOT NULL  ('size_range' | 'ad_id')
  size_range_id   uuid FK -> terminal_order_size_ranges(id) [nullable]
  ad_id           text [nullable]
  assigned_by     uuid FK -> users(id)
  is_active       boolean default true
  created_at      timestamptz default now()
```

### 1d. Auto-Reply Exclusions Table

```text
terminal_auto_reply_exclusions
  id            uuid PK default gen_random_uuid()
  order_number  text NOT NULL UNIQUE
  excluded_by   uuid FK -> users(id)
  created_at    timestamptz default now()
```

### 1e. Payer Order Log (for load balancing + hiding paid orders)

```text
terminal_payer_order_log
  id            uuid PK default gen_random_uuid()
  order_number  text NOT NULL
  payer_id      uuid FK -> users(id)
  action        text NOT NULL default 'marked_paid'
  created_at    timestamptz default now()
```

All tables: RLS enabled, policies for `public` role (matching existing terminal tables).

---

## 2. Auto-Reply Engine Update

Edit `supabase/functions/auto-reply-engine/index.ts`:
- Before sending auto-reply, query `terminal_auto_reply_exclusions` for the order number.
- If found, skip the auto-reply for that order.

---

## 3. Frontend: Auth Updates

### 3a. `useTerminalAuth.tsx`
Add `terminal_payer_view` and `terminal_payer_manage` to the `TerminalPermission` type union.

### 3b. `TerminalSidebar.tsx`
- Remove `comingSoon: true` from the Payer nav item.
- Add `requiredPermission: 'terminal_payer_view'`.

### 3c. `App.tsx`
Replace the `TerminalComingSoon` placeholder for `/terminal/payer` with the new `TerminalPayer` component.

---

## 4. Frontend: Payer Page

### 4a. `src/pages/terminal/TerminalPayer.tsx`

Main page that:
- Fetches active **BUY** orders only (reuses `useBinanceActiveOrders`, filters `tradeType === 'BUY'`).
- Filters orders to match the current payer's assignments (by size range or ad ID) using `terminal_payer_assignments`.
- **Load balancing**: If multiple payers share the same assignment, query `terminal_payer_order_log` to count active orders per payer. Show orders only to the payer with the fewest active (unmarked) orders.
- Hides orders already marked paid by any payer (via `terminal_payer_order_log`).

**List View columns:**
| Type/Date | Order No. | Amount | Counterparty | Payment Details | Status | Actions |

### 4b. `src/components/terminal/payer/PayerOrderRow.tsx`

Each row renders:

**Payment Details (inline)**:
- **UPI**: Verified name, UPI ID, amount
- **Bank Transfer**: Account number, IFSC code, Verified name, Bank name
- Data sourced from `useBinanceOrderDetail` -> `payMethods` array in the live detail response.

**Action Buttons (directly on row, no need to open order)**:
1. **Mark Paid** -- Calls existing `useMarkOrderAsPaid` hook (Binance API). On success, logs to `terminal_payer_order_log` and removes the row from view. Shows confirmation dialog.
2. **Remove from Auto** -- Inserts `order_number` into `terminal_auto_reply_exclusions`. Button toggles to disabled "Removed" state after click.

**Row click** -> Opens `OrderDetailWorkspace` (existing component) for full chat and order details.

### 4c. `src/hooks/usePayerModule.ts`

Custom hook encapsulating:
- Fetch payer's assignments from `terminal_payer_assignments`
- Fetch `terminal_payer_order_log` for load balancing and hiding paid orders
- Filter and sort logic for BUY orders matching assignments
- Insert into exclusion/log tables

---

## 5. Payer Assignment Management

### 5a. `src/components/terminal/payer/PayerAssignmentManager.tsx`

A management UI accessible from the **Users & Roles** page (new "Payer Assignments" tab):
- Lists all users with the Payer role and their current assignments
- Allows supervisors (hierarchy level 4 and above, i.e., Team Lead, AM, Ops Manager, COO, Admin) to:
  - Assign a payer to a size range (dropdown from `terminal_order_size_ranges` filtered to `order_type = 'BUY'` or `'BOTH'`)
  - Assign a payer to a specific Binance ad ID
  - Toggle active/inactive on assignments
  - View each payer's current active order count

### 5b. Update `src/pages/terminal/TerminalUsers.tsx`
Add "Payer Assignments" tab that renders `PayerAssignmentManager`.

---

## 6. File Summary

| Action | File |
|--------|------|
| Create | `supabase/migrations/...payer_module.sql` |
| Create | `src/pages/terminal/TerminalPayer.tsx` |
| Create | `src/components/terminal/payer/PayerOrderRow.tsx` |
| Create | `src/components/terminal/payer/PayerAssignmentManager.tsx` |
| Create | `src/hooks/usePayerModule.ts` |
| Edit | `src/App.tsx` (route swap) |
| Edit | `src/components/terminal/TerminalSidebar.tsx` (remove comingSoon) |
| Edit | `src/hooks/useTerminalAuth.tsx` (add payer permissions) |
| Edit | `src/pages/terminal/TerminalUsers.tsx` (add tab) |
| Edit | `supabase/functions/auto-reply-engine/index.ts` (exclusion check) |
| Edit | `src/integrations/supabase/types.ts` (new tables) |

