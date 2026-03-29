

# Drop Purchase Creator/Payer Function Split + Permission System Overhaul

## Summary

Remove the `purchase_creator` and `payer` function separation. All users with `purchase_manage` permission get full purchase access (combined mode). The `system_functions` / `role_functions` infrastructure stays for other functions (e.g., `erp_reconciliation`). This is combined with the previously approved permission system cleanup.

---

## Part A: Drop Purchase Creator/Payer

### What changes

1. **Simplify `usePurchaseFunctions.tsx`** — Remove the DB fetch, RPC call, and legacy fallback. Hardcode all flags to "combined mode" (`canCreateOrders: true`, `canAddToBank: true`, etc.). Keep the hook interface so consumers don't break, but it becomes a static return with no API calls.

2. **Simplify `BuyOrderCard.tsx`** — Remove all conditional branches for payer-only / creator-only paths (waiting badges, role-based status hiding). Every user sees all actions.

3. **Simplify `BuyOrderAlertWatcher.tsx`** — Remove role-based alert filtering. All alerts are relevant, all buzzers use standard intensity.

4. **DB cleanup (data operation)** — Delete `purchase_creator` and `payer` rows from `system_functions` table. Delete corresponding `role_functions` entries. Remove `is_purchase_creator` and `is_payer` columns from `users` table (migration).

5. **Clean up `FunctionsTab.tsx`** — The purchase-specific info note ("must have at least one purchase function") becomes irrelevant. Update copy.

6. **`EditRoleDialog.tsx`** — The functions section will no longer show purchase_creator/payer options (they'll be gone from DB). No code change needed beyond the data cleanup.

7. **Keep `useErpReconciliationAccess.ts`** untouched — it uses `system_functions` for `erp_reconciliation`, which stays.

### Files affected
| File | Change |
|---|---|
| `src/hooks/usePurchaseFunctions.tsx` | Gut internals, return static combined-mode values |
| `src/components/purchase/BuyOrderCard.tsx` | Remove role-conditional UI branches |
| `src/components/purchase/BuyOrderAlertWatcher.tsx` | Remove role-based alert filtering |
| `src/components/purchase/BuyOrdersTab.tsx` | Minor: still passes purchaseFunctions but it's now static |
| `src/components/user-management/FunctionsTab.tsx` | Update info text |
| `src/types/auth.ts` | Remove `is_purchase_creator`, `is_payer` from `DatabaseUser` |
| Migration | Drop `is_purchase_creator`, `is_payer` columns from `users` table |
| Data operation | Delete `purchase_creator`/`payer` from `system_functions` and `role_functions` |

---

## Part B: Permission System Overhaul (from approved plan)

### Phase 1: Data Fixes + Enum Cleanup
- Strip Auditor's destructive/manage permissions
- Add missing permissions to Super Admin/Admin
- Fix orphaned user roles
- Sync `users.role_id` from `user_roles`
- Set `is_system_role = true` for Super Admin
- Remove dead enum values from `app_permission`

### Phase 2: Permission Audit Trail
- Create `permission_change_log` table with triggers on `role_permissions` and `role_functions`
- Add "Recent Changes" display in PermissionsTab

### Phase 3: Backend RPC Enforcement
- `require_permission()` SQL function with audit/enforce toggle
- Gate 7 critical RPCs (start in audit mode)
- `permission_enforcement_log` table

### Phase 4: Enhanced Role Editor UI
- Group permissions by module in `EditRoleDialog`
- Color-code tiers (view/manage/destructive)
- Role templates, change diff preview

---

## Technical Details

### usePurchaseFunctions simplification
The hook will still export the same interface but become a zero-network-call hook:
```typescript
export function usePurchaseFunctions() {
  return {
    isPurchaseCreator: true,
    isPayer: true,
    isCombined: true,
    isLoading: false,
    isAlertRelevant: () => true,
    getBuzzerIntensity: () => ({ type: 'single' as const }),
    canCreateOrders: true,
    canCollectBanking: true,
    canCollectPan: true,
    canAddToBank: true,
    canRecordPayment: true,
    showWaitingForBanking: false,
    showWaitingForPan: false,
    canSubmitReview: false,
    canSeeReviews: false,
    canCompleteOrder: true,
  };
}
```

This preserves backward compatibility — no consumer needs to change their imports. The role-conditional UI in BuyOrderCard will still work but all conditions evaluate to "combined mode."

### Migration for dropping columns
```sql
ALTER TABLE public.users 
  DROP COLUMN IF EXISTS is_purchase_creator,
  DROP COLUMN IF EXISTS is_payer;
```

### Execution order
1. Part A first (drop creator/payer) — immediate, no risk
2. Part B Phase 1 (data fixes) — immediate
3. Part B Phase 2 (audit trail) — immediate
4. Part B Phase 3 (enforcement) — deploy in audit mode
5. Part B Phase 4 (UI) — alongside phases 1-2

