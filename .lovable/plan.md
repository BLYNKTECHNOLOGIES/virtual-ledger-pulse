# TDS Segregation by Payment Bank & Company

## Goal
Today TDS is stored as **one row per purchase order** (`tds_records`, 1:1 with `purchase_orders`) and shown **aggregated by PAN only**. This mixes companies together and hides that a single order's payment was split across banks belonging to different group companies.

You want:
1. TDS broken down **per payment transaction** (the ₹50k example → a ₹10k line and a ₹40k line) instead of one lump per order.
2. Each line to reference the **Binance order number** of the source purchase order.
3. Segregation by **company** — Shubham Singh, Vertex Shift, Asec, Blynk — derived from the bank that made each payment.
4. **Payment/filing tracked per company**, since each company files its own TDS return.
5. Applied to **both** the Accounting → Tax Management tab and the Compliance → Taxation tab.

## How the data connects (verified)
- Payment splits live in `purchase_order_payment_splits` (order → bank_account_id → amount). This is the payment source of truth.
- `bank_accounts.subsidiary_id` → `subsidiaries.firm_name` gives the company. All 4 firms are mapped; **0 split banks are unmapped**.
- Binance order number = `purchase_orders.terminal_sync_id` → `terminal_purchase_sync.binance_order_number` (equals `order_number` for synced orders).
- 1,549 TDS orders total: 1,182 have payment splits; **367 have no splits but all have a single `bank_account_id`** (fallback = whole TDS to that one bank/company).

## Allocation rule (no double counting)
TDS is 1% of the order amount, so per-transaction TDS = the order's `tds_rate` applied to each split's paid amount:
- ₹10k split → ₹100, ₹40k split → ₹400, summing to the order's ₹500. Same PAN and same order number on both lines.
- The sum of allocations for an order is **forced to equal the order's stored `tds_amount`**; any rounding remainder (within the 0.01 tolerance) is absorbed into the largest split so totals reconcile exactly and nothing is double-counted.
- No-split orders → one allocation = full order TDS on the order's primary bank/company.

## Plan

### 1. New table `tds_payment_allocations` (per transaction)
One row per (purchase order × payment bank split):
- order link, `pan_number`, `supplier_name`, `binance_order_number`
- `bank_account_id`, `subsidiary_id` (company), `firm_name` snapshot
- `paid_amount` (the split amount), `allocated_tds_amount`, `tds_rate`, `deduction_date`, `financial_year`
- payment/filing fields: `payment_status`, `paid_at`, `paid_by`, `payment_bank_account_id`, `payment_batch_id`, `tds_certificate_number`
- Standard grants + RLS for `authenticated`/`service_role`; updated_at trigger.

### 2. DB function + triggers to keep it correct
- `rebuild_tds_allocations(po_id)`: deletes & regenerates allocation rows for one order from its splits (or single bank fallback), applying the allocation rule above and carrying over existing paid/filed status by bank where possible so payment history is not lost.
- Triggers on `purchase_order_payment_splits` (insert/update/delete) and on `purchase_orders` (when `tds_applied`/`tds_amount`/`tds_rate`/bank changes) call the rebuild. Skips CANCELLED orders.
- One-time **backfill** for all existing non-cancelled TDS orders, migrating current `tds_records` paid/filed status onto the matching company allocation.

### 3. Accounting → Tax Management tab (`TaxManagementTab.tsx`)
- Keep the quarter selector + summary cards (totals recomputed from allocations).
- Replace the PAN table with **company tabs** (All / Shubham Singh / Vertex Shift / Asec / Blynk), each a flat list of rows: PAN, supplier, Order #, **Binance Order #**, paying bank, paid amount, allocated TDS, status.
- **Mark-as-paid is per company**: select rows within a company tab, choose that company's bank, record paid → updates allocation rows + creates a single `bank_transactions` EXPENSE on the paying bank (one batch id). Prevents cross-company payment.
- Export gains Company, Bank, Order #, Binance Order # columns; one row per allocation.

### 4. Compliance → Taxation tab (`TaxationComplianceTab.tsx`)
- Switch its source to `tds_payment_allocations`, add company tabs + Binance order number column, and make certificate filing per company/allocation.

## Data anomalies handled
- **Split sum ≠ order total** (tolerance): allocations forced to reconcile to stored `tds_amount`; remainder to largest split.
- **No-split TDS orders (367)**: fallback to single `bank_account_id`.
- **Edits to splits/TDS after payment**: rebuild preserves already-paid/filed status per bank; flags an allocation if a paid order's splits change so it can't silently drift.
- **Unmapped bank company**: shown under an "Unassigned" tab (currently none, but guarded).
- **Cancelled / off-market orders**: excluded, matching existing behavior.
- **Adjustment buckets**: excluded via existing `filterNonAdjustmentBanks`.
- **No double counting**: per-order allocations always sum to the order's TDS; reports keep reading the order-level TDS so group totals are unchanged.

## Technical notes
- New table + function/triggers via one migration (with GRANT + RLS); backfill via data migration.
- Frontend reads allocations with `fetchAllPaginated` where row counts exceed 1000.
- `tds_records` is retained for backward compatibility during transition; allocations become the display/payment source.
