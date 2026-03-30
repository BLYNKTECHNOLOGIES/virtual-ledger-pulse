

# Phase 24: B55 + B56 + B57 Fixes

## B55 — Edge Functions Auth Hardening

### Current State
- `admin-reset-password`: Has `verify_jwt=false`. It does check the Bearer token via `adminClient.auth.getUser(token)` and verifies admin role — BUT it has a **critical bypass**: if no valid JWT is present, it falls back to accepting `callerUserId` from the request body (line 52-54). Any attacker can send `{ userId: "target", newPassword: "hacked", callerUserId: "any-admin-uuid" }` and reset any password.
- `create-erp-user`: Same pattern — falls back to `callerUserId` from body (line 73). Same vulnerability.
- `migrate-users-to-auth`: Uses a hardcoded secret `"BLYNK_MIGRATE_2026_SECURE"` in the request body. Discoverable by anyone reading the source code.

### Fix
1. **Remove `callerUserId` fallback** from both `admin-reset-password` and `create-erp-user`. If `auth.getUser(token)` fails, return 401. No exceptions.
2. **Remove `callerUserId` from the Zod schema** in both functions.
3. **`migrate-users-to-auth`**: This is a one-time migration utility. The safest fix is to **delete it entirely** — it has already been run. If it's still needed, it should validate the Bearer token + admin role instead of a hardcoded secret.

### Files Changed
- `supabase/functions/admin-reset-password/index.ts` — remove `callerUserId` from schema + fallback
- `supabase/functions/create-erp-user/index.ts` — remove `callerUserId` from schema + fallback
- `supabase/functions/migrate-users-to-auth/index.ts` — delete entirely
- `supabase/config.toml` — remove `[functions.migrate-users-to-auth]` entry

---

## B56 — `first_action_at` Never Populated

### Current State
- `terminal_order_assignments.first_action_at` column exists but nothing sets it
- `generate_terminal_mpi_snapshots` uses it for `avg_response_time_minutes` (30% MPI weight)
- Result: every operator's response time score is permanently 0

### Fix
Create a database trigger on `p2p_order_chats` INSERT that:
1. Finds the `terminal_order_assignments` row matching the chat's `order_id` (via `order_number` join through `p2p_order_records`)
2. If `first_action_at` is NULL, sets it to `NOW()`
3. Only fires when the chat sender is the assigned operator (not the counterparty)

This captures the moment an operator first responds to an order — the true "response time" metric.

### Migration SQL
```sql
CREATE OR REPLACE FUNCTION public.set_first_action_at_on_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE terminal_order_assignments toa
  SET first_action_at = NOW()
  FROM p2p_order_records por
  WHERE por.id = NEW.order_id
    AND toa.order_number = por.order_number
    AND toa.is_active = true
    AND toa.first_action_at IS NULL
    AND toa.assigned_to = NEW.sender_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_first_action_at
AFTER INSERT ON p2p_order_chats
FOR EACH ROW
EXECUTE FUNCTION set_first_action_at_on_chat();
```

No backfill is possible — historical chat timestamps can't reliably reconstruct first-action times.

---

## B57 — Blocked Phone Numbers Not Checked in Backend

### Current State
- Frontend checks exist in `QuickSalesOrderDialog`, `TerminalSalesApprovalDialog`, and `CounterpartyContactInput` — all using `isPhoneBlocked()`
- **No database-level enforcement** — if someone bypasses the UI (direct API call, bulk import), blocked phones pass through
- Tables with phone fields that need protection: `clients`, `client_onboarding_approvals`, `sales_orders`

### Fix
Create a database trigger function that checks phone fields against `blocked_phone_numbers` on INSERT/UPDATE and raises an exception if blocked:

```sql
CREATE OR REPLACE FUNCTION public.reject_blocked_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text;
BEGIN
  -- Check client_phone field (used by sales_orders, client_onboarding_approvals)
  v_phone := COALESCE(NEW.client_phone, NEW.phone, NULL);
  IF v_phone IS NOT NULL AND v_phone != '' THEN
    IF EXISTS (SELECT 1 FROM blocked_phone_numbers WHERE phone = btrim(v_phone)) THEN
      RAISE EXCEPTION 'Phone number % is blocked', v_phone;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach to relevant tables
CREATE TRIGGER trg_reject_blocked_phone_clients
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();

CREATE TRIGGER trg_reject_blocked_phone_onboarding
BEFORE INSERT OR UPDATE ON client_onboarding_approvals
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();

CREATE TRIGGER trg_reject_blocked_phone_sales
BEFORE INSERT OR UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION reject_blocked_phone();
```

This makes the block list enforceable at the database level regardless of how data enters the system.

---

## Summary

| # | Bug | Severity | Action | Target |
|---|-----|----------|--------|--------|
| B55a | `callerUserId` bypass in admin-reset-password | CRITICAL | Remove fallback, require JWT | Edge function |
| B55b | `callerUserId` bypass in create-erp-user | CRITICAL | Remove fallback, require JWT | Edge function |
| B55c | migrate-users-to-auth hardcoded secret | HIGH | Delete function entirely | Edge function + config.toml |
| B56 | `first_action_at` never set | HIGH | Trigger on `p2p_order_chats` INSERT | Migration |
| B57 | Blocked phones not enforced in DB | MEDIUM | Trigger on clients/onboarding/sales_orders | Migration |

**5 files changed, 1 file deleted, 1 migration created.**

