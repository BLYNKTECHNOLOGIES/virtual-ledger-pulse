

## Alternate UPI Request Workflow

### Overview
Build a workflow where a **Payer** can request an alternate UPI for a specific order, which surfaces as a highlighted notification on the **Operator's Orders page**. The operator can then update the payment method, and the payer sees the new UPI details in real-time.

### Database Changes

**New table: `terminal_alternate_upi_requests`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| order_number | text NOT NULL | Binance order number |
| requested_by | uuid FK → profiles | Payer who requested |
| status | text | `pending` / `resolved` / `dismissed` |
| updated_upi_id | text | New UPI set by operator |
| updated_upi_name | text | Verified name for new UPI |
| updated_pay_method | text | e.g. "UPI", "Paytm", "PhonePe" |
| resolved_by | uuid FK → profiles | Operator who resolved |
| created_at | timestamptz | |
| resolved_at | timestamptz | |

RLS: authenticated users can select/insert/update. This table tracks the request lifecycle.

### Component Changes

#### 1. Payer Side — `PayerOrderRow.tsx`
- Add a **"Request Another UPI"** button (icon: `RefreshCw` or `ArrowLeftRight`) next to the existing action buttons.
- Clicking it inserts a row into `terminal_alternate_upi_requests` with `status: 'pending'`.
- Button shows "Requested" (disabled) if a pending request already exists for that order.
- When the request is resolved (has `updated_upi_id`), the `PaymentDetailsInline` component should **prioritize the override UPI** from the request table over the Binance API data.

#### 2. Operator Side — `TerminalOrders.tsx` (Order List)
- Query `terminal_alternate_upi_requests` where `status = 'pending'`.
- For orders with pending requests, show a highlighted badge: **"Alternate UPI Requested"** (amber/orange highlight on the row).
- Optionally show a count badge/notification indicator on the Orders sidebar item.

#### 3. Operator Side — `OrderSummaryPanel.tsx` (Order Detail)
- When a pending alternate UPI request exists for the current order, show a prominent alert card:
  - Text: "Payer has requested an alternate UPI for this order"
  - **"Update Payment Method"** button that opens a dialog.

#### 4. New Component — `UpdatePaymentMethodDialog.tsx`
- Dialog with fields: Payment Method type (dropdown: UPI, Paytm, PhonePe, GPay, etc.), UPI ID (text input), Verified Name (text input).
- On submit: updates the `terminal_alternate_upi_requests` row with `status: 'resolved'`, `updated_upi_id`, `updated_upi_name`, `updated_pay_method`, `resolved_by`, `resolved_at`.

#### 5. Payer Side — Payment Display Override
- In `PayerOrderRow.tsx` → `PaymentDetailsInline`, before rendering Binance payment methods, check if there's a resolved alternate UPI request for this order.
- If yes, render the **updated UPI details** from the request table instead of (or before) the Binance-fetched details, with a small badge like "Updated UPI".

### Hook Changes — `usePayerModule.ts`

- `useAlternateUpiRequest(orderNumber)` — query single request by order number
- `useAlternateUpiRequests(status?)` — query all pending requests (for operator list)
- `useRequestAlternateUpi()` — mutation to insert request
- `useResolveAlternateUpi()` — mutation to update with new UPI details

### Data Flow

```text
Payer clicks "Request Another UPI"
       │
       ▼
terminal_alternate_upi_requests (status: pending)
       │
       ▼
Operator sees highlighted order in Orders page
       │
       ▼
Operator opens order → sees alert → clicks "Update Payment Method"
       │
       ▼
Fills new UPI details → resolves request (status: resolved)
       │
       ▼
Payer's PaymentDetailsInline shows updated UPI instead of original
```

### Files to Create/Modify
- **Create**: `supabase/migrations/...` — new table + RLS
- **Create**: `src/components/terminal/orders/UpdatePaymentMethodDialog.tsx`
- **Modify**: `src/hooks/usePayerModule.ts` — add 4 new hooks
- **Modify**: `src/components/terminal/payer/PayerOrderRow.tsx` — add button + override display
- **Modify**: `src/components/terminal/orders/OrderSummaryPanel.tsx` — show alert + update button
- **Modify**: `src/pages/terminal/TerminalOrders.tsx` — highlight rows with pending requests

