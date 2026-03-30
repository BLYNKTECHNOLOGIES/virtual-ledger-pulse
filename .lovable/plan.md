

# ERP Full System Audit — Phase 7 Report

## Phases 1-6 Status (completed)
- Phase 1-4: Data integrity, orphaned code, permissions, demo-admin cleanup — ALL FIXED
- Phase 5: Hardcoded password, dead localStorage, native dialogs replaced — ALL FIXED
- Phase 6: XSS fix, stale removeItems, shift delete cleanup — ALL FIXED
- Phase 6.5: Buy Orders/Pending/Review tabs removed, 25 files deleted, dead DB columns + trigger dropped — ALL FIXED

---

## CATEGORY 1: DEAD DATABASE TABLES (Post Buy-Order Removal)

### P7-DB-01 | 3 empty purchase tables now orphaned (MEDIUM)

After removing the buy order workflow, these tables have **0 rows** and no active code consumers:

| Table | Rows | Code References | Verdict |
|-------|------|-----------------|---------|
| `purchase_order_reviews` | 0 | Only in types.ts (auto-generated) | **DROP** — ReviewDialog deleted |
| `purchase_order_status_history` | 0 | Only in types.ts | **DROP** — buy order workflow deleted |
| `purchase_order_payments` | 0 | `PurchaseOrderDetailsDialog.tsx` reads `order.purchase_order_payments` (always empty array) | **DROP** — safe, never populated |

**Fix**: Migration to drop all 3 tables. Remove the dead `.purchase_order_payments` reference in PurchaseOrderDetailsDialog.

---

## CATEGORY 2: DEAD CONTEXT & HOOK

### P7-DEAD-01 | OrderFocusContext — `useIsOrderFocused` never called, `order-card-` ID never rendered (LOW)

`OrderFocusContext` provides `focusOrder()` which scrolls to `document.getElementById('order-card-${orderId}')`. However:
- **No component renders `id="order-card-..."`** — the BuyOrderCard (which had it) was deleted in Phase 6.5
- `useIsOrderFocused()` is exported but **never imported** anywhere
- `focusOrder()` is still called by `NotificationContext` for order click-through — it just silently does nothing (element not found)

**Status**: The context itself is still used by NotificationContext (which is used broadly), so we can't delete it. But `useIsOrderFocused` is dead code.

**Fix**: Remove the `useIsOrderFocused` export from OrderFocusContext.tsx. LOW priority — cosmetic dead code.

---

## CATEGORY 3: REMAINING UX ISSUES

### P7-UX-01 | EditUserDialog uses `window.location.reload()` for role change (MEDIUM)

`EditUserDialog.tsx` line 247 does `window.location.reload()` after updating the current user's own role. This is a full page reload that loses React state. Should use React Query invalidation + re-fetch permissions instead.

**Fix**: Replace `window.location.reload()` with `queryClient.invalidateQueries()` for permissions/user data, then close dialog.

### P7-UX-02 | TopHeader + NotificationDropdown manual reload buttons (ACCEPTABLE)

Both have "Reload Page" menu items using `window.location.reload()`. These are **intentional UX** — user-initiated "hard refresh" actions, not automated logic. No fix needed.

---

## CATEGORY 4: STALE QUERY INVALIDATIONS

### P7-CLEAN-01 | Purchase.tsx summary query only counts COMPLETED (LOW)

The `purchase_orders_summary` query in Purchase.tsx still queries for `pending` and `review_needed` counts (removed in Phase 6.5). Wait — I already cleaned this in the rewrite. Verified clean.

---

## CATEGORY 5: PURCHASE_ACTION_TIMINGS TABLE

### P7-DATA-01 | purchase_action_timings has 710 rows but workflow deleted (KEEP)

This table records who created/paid each order with timestamps. It's actively queried by:
- `src/lib/purchase-action-timing.ts` — records timings during ManualEntry and TerminalSync approval
- `src/hooks/useOrderActors.ts` — displays creator/payer info on order details
- `src/components/purchase/TransactionActorsCard.tsx` — renders actor cards

**Status**: KEEP — still provides historical data for completed orders.

---

## IMPLEMENTATION PLAN

### Phase 7A — Drop dead DB tables (3 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 1 | P7-DB-01 | Migration: DROP `purchase_order_reviews`, `purchase_order_status_history`, `purchase_order_payments` | 2 min |
| 2 | P7-DB-01 | Remove dead `purchase_order_payments` reference from PurchaseOrderDetailsDialog | 1 min |

### Phase 7B — Dead code + UX cleanup (5 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 3 | P7-DEAD-01 | Remove `useIsOrderFocused` from OrderFocusContext.tsx | 1 min |
| 4 | P7-UX-01 | Replace `window.location.reload()` in EditUserDialog with query invalidation | 4 min |

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Dead DB tables (0 rows, no consumers) | 3 tables | MEDIUM — orphaned schema |
| Dead exported hook | 1 function | LOW — cosmetic |
| window.location.reload in EditUserDialog | 1 file | MEDIUM — loses React state |
| purchase_action_timings | 710 rows | KEEP — active consumers |

**Total effort: ~8 minutes for 4 fixes**

