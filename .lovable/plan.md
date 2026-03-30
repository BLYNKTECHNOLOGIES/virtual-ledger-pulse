

# Phase 28: W30 + W31 + W32

## W30 — ad_pricing_rules / ad_rest_timer RLS: PARTIALLY ALREADY FIXED

Phase 27 hardened **29 terminal tables** with `verify_terminal_access` RLS. The three tables mentioned in W30:
- `terminal_operator_assignments` — already hardened in Phase 27
- `ad_pricing_rules` — still has open `authenticated_all_ad_pricing_rules` policy (USING: true)
- `ad_rest_timer` — still has open `authenticated_all_ad_rest_timer` policy (USING: true)

**Fix:** Drop the open policies on `ad_pricing_rules` and `ad_rest_timer`, replace with `verify_terminal_access` for reads and `has_terminal_permission` for writes (these are pricing-sensitive tables). Keep `service_role` unrestricted.

| Table | READ | WRITE |
|-------|------|-------|
| `ad_pricing_rules` | `verify_terminal_access` | `has_terminal_permission(auth.uid(), 'terminal_ads_pricing_manage')` |
| `ad_rest_timer` | `verify_terminal_access` | `has_terminal_permission(auth.uid(), 'terminal_ads_pricing_manage')` |

---

## W31 — set_first_action_at_on_chat trigger performance: LOW PRIORITY, NO ACTION

The trigger joins `p2p_order_chats → p2p_order_records → terminal_order_assignments`. This is a 2-table join but:
1. Chat volume is low (terminal is lightly used — 15 historical assignments)
2. The join uses indexed columns (`p2p_order_records.id` is PK, `terminal_order_assignments.order_number` + `is_active` are indexed)
3. The `first_action_at IS NULL` filter means the trigger only does real work once per assignment — all subsequent chats hit the NULL check and exit early
4. Denormalizing `order_number` onto `p2p_order_chats` would add write overhead on every chat INSERT for marginal read savings

**No action needed.** The trigger is efficient for current and foreseeable volumes.

---

## W32 — process_scheduled_account_deletions safety guard

**Current state:** The function deletes accounts where `account_deletion_date <= CURRENT_DATE AND is_active = false AND user_id IS NOT NULL`. The `is_active = false` check is already a guard — only terminated employees are eligible.

**Improvement:** Add a `deletion_approved_by IS NOT NULL` guard. This requires:
1. Adding `deletion_approved_by UUID` column to `hr_employees`
2. Adding the check to the deletion query
3. The offboarding UI that sets `account_deletion_date` must also set `deletion_approved_by` to the current user

This ensures a human explicitly approved the deletion, preventing edge cases where `account_deletion_date` was set programmatically or in error without managerial sign-off.

### Migration
```sql
-- Add approval column
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS deletion_approved_by uuid;

-- Recreate function with approval guard
CREATE OR REPLACE FUNCTION process_scheduled_account_deletions()
-- ... same body but WHERE clause adds:
--   AND deletion_approved_by IS NOT NULL
```

### Frontend
The component that sets `account_deletion_date` must also set `deletion_approved_by` to the logged-in user's ID. Need to find and update that UI.

---

## Summary

| # | Item | Action | Target |
|---|------|--------|--------|
| W30 | ad_pricing_rules + ad_rest_timer RLS | Drop open policies, add terminal-gated policies | Migration |
| W31 | Chat trigger perf | No action — efficient for current volume | — |
| W32 | Deletion approval guard | Add `deletion_approved_by` column + function guard | Migration + frontend |

**1 migration, 1 frontend file update (offboarding UI).**

