

# Terminal Bug Audit & Fix Plan

## Bugs Found

### BUG 1 (CRITICAL): Permission Parsing Failure — All Non-Admin Users Have Zero Permissions
**File**: `src/hooks/useTerminalAuth.tsx`, line 154
**Root cause**: The `get_terminal_permissions` RPC returns `SETOF text`. PostgREST wraps each row as `{get_terminal_permissions: "terminal_orders_view"}`. But the frontend reads `p.permission` — a key that doesn't exist. Every non-SuperAdmin terminal user gets an array of `undefined` values.
**Impact**: All operators, payers, team leads — anyone who isn't a Super Admin — see zero sidebar items (after the `showAll` fix), zero permission gates pass, and they effectively can't use the terminal.
**Fix**: Change `p.permission` to `(typeof p === 'string' ? p : p.get_terminal_permissions || p.permission || p)`.

### BUG 2 (MEDIUM): BiometricAuthGate uses `useState` instead of `useRef` for timer
**File**: `src/components/terminal/BiometricAuthGate.tsx`, line 32
**Root cause**: `const tapTimerRef = useState<NodeJS.Timeout | null>(null)` — uses `useState` instead of `useRef`. Direct mutation of `tapTimerRef[0]` doesn't persist across renders correctly and could cause the 5-tap secret trigger to fail intermittently.
**Fix**: Change to `useRef<NodeJS.Timeout | null>(null)` and update access from `tapTimerRef[0]` to `tapTimerRef.current`.

### BUG 3 (LOW): Missing `search_path` on 3 SECURITY DEFINER functions
**Functions**: `extend_terminal_biometric_session`, `revoke_terminal_biometric_session`, `validate_terminal_biometric_session`
**Risk**: Without `SET search_path`, these functions could be exploited via search_path manipulation in theory. They currently work because they use fully qualified `public.` references, but it's a security hygiene issue.
**Fix**: Add `SET search_path TO 'public'` to all three functions.

### BUG 4 (LOW): `resolve_terminal_escalation` has no permission guard
**Function**: `resolve_terminal_escalation(p_escalation_id, p_resolved_by, p_resolution_note)`
**Root cause**: Unlike `escalate_terminal_order` and `re_escalate_terminal_order` which check `has_terminal_access()`, this function has no check at all — anyone with the function name could resolve escalations.
**Fix**: Add `has_terminal_access(p_resolved_by)` guard.

### BUG 5 (LOW): `assign_terminal_order` / `unassign_terminal_order` have no permission guards
**Root cause**: These SECURITY DEFINER functions accept arbitrary user IDs with no verification that the caller has permission to assign/unassign orders. The frontend passes `userId` but doesn't validate server-side.
**Fix**: Add permission checks (`has_terminal_permission(p_assigned_by, 'terminal_orders_manage')` or admin check).

---

## Implementation Plan

### Step 1: Fix Permission Parsing (Critical)
**File**: `src/hooks/useTerminalAuth.tsx`
Change line 154 from:
```ts
const perms = permsRes.data.map((p: any) => p.permission as TerminalPermission);
```
To:
```ts
const perms = permsRes.data.map((p: any) =>
  (typeof p === 'string' ? p : p.get_terminal_permissions || p.permission || p) as TerminalPermission
);
```

### Step 2: Fix BiometricAuthGate useRef
**File**: `src/components/terminal/BiometricAuthGate.tsx`
- Line 32: `useState` → `useRef`
- Lines 37, 42: `tapTimerRef[0]` → `tapTimerRef.current`

### Step 3: SQL Migration — Fix RPC Guards & search_path
Single migration that:
1. Adds `SET search_path TO 'public'` to `extend_terminal_biometric_session`, `revoke_terminal_biometric_session`, `validate_terminal_biometric_session`
2. Adds permission guard to `resolve_terminal_escalation`
3. Adds permission guard to `assign_terminal_order` and `unassign_terminal_order`

---

## Summary
- 2 frontend file fixes + 1 SQL migration
- Bug 1 is the highest priority — it breaks the terminal for all non-admin users
- No new functionality added; all changes are guards and fixes to existing code

