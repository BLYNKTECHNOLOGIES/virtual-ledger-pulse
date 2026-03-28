
# Supabase Auth Migration Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 - Create auth accounts | ✅ DONE | 19 users synced with matching UUIDs, 34 junk entries cleaned |
| 2 - Dual-mode login | ✅ DONE | useAuth.tsx + LoginPage.tsx updated, backdoor removed |
| 3 - Migrate localStorage readers | 🔲 TODO | 25+ files need refactoring |
| 4 - Tighten RLS policies | 🔲 TODO | 329 policies to rewrite |
| 5 - Cleanup | 🔲 TODO | Remove legacy auth code |

Temp password for all Supabase Auth accounts: `BlynkTemp2026!`

---


# Supabase Auth Migration Plan

## Current State Summary

- **19 active users** in `public.users` with bcrypt password hashes (via pgcrypto)
- **0 of these users** exist in `auth.users` (no UUID overlap)
- **35 junk/test entries** in `auth.users` from early experimentation (no FK references anywhere)
- **329 RLS policies** across ~150+ tables; virtually all set to `public`/`anon` with `qual=true`
- **73+ columns** across tables reference user IDs (`user_id`, `created_by`, `assigned_to`, etc.)
- **2 login paths**: `useAuth.tsx` (ERP) and `LoginPage.tsx` (website) -- both use custom localStorage auth
- **25+ files** read/write `localStorage('userSession')` for identity
- Hardcoded admin backdoor in `LoginPage.tsx` (`Blynk@0717`)

## Migration Strategy: Phased Approach

The migration will be done in **5 phases**, each deployable independently. At no point will the ERP go down or lose data.

---

### Phase 1: Create Auth Accounts with Matching UUIDs

**Goal**: Populate `auth.users` with all 19 real users, preserving their existing UUIDs so every FK in every table continues to work.

**What happens**:
- An Edge Function (admin-only) calls `supabase.auth.admin.createUser()` for each user, passing their existing `public.users.id` as the `id` parameter
- Each user gets a temporary password (e.g., `BlynkTemp2026!`)
- Emails are normalized to lowercase to match Supabase Auth's behavior
- The 35 junk `auth.users` entries are cleaned up first

**What could go wrong**:
- Email case mismatch: `Amit2000dangi05@gmail.com` vs `amit2000dangi05@gmail.com` -- the Edge Function will normalize
- If any UUID collision occurs (it won't since auth_id is NULL for all 19), the script logs and skips
- Password format: Supabase Auth uses its own bcrypt, so old hashes cannot be imported. Users MUST use the temp password on first login

**Data impact**: None. `public.users` table is untouched. New rows are created in `auth.users` with matching IDs.

---

### Phase 2: Dual-Mode Login (Transition Period)

**Goal**: Update `useAuth.tsx` and `LoginPage.tsx` to authenticate via `supabase.auth.signInWithPassword()` while keeping the old RPC as fallback.

**What changes in code**:
- `useAuth.tsx` login flow: Try `supabase.auth.signInWithPassword()` first. If it fails, fall back to existing `validate_user_credentials` RPC
- On successful Supabase Auth login, the session is managed by Supabase (JWT in memory, refresh token in localStorage) instead of custom `userSession` localStorage
- A compatibility layer writes the same `userSession` localStorage format so all 25+ files that read it continue working without changes
- `LoginPage.tsx` (website): Same dual-mode approach; remove hardcoded backdoor credentials
- Session restoration switches from localStorage JSON to `supabase.auth.getSession()`

**What changes in DB**:
- Nothing. Old RLS policies remain open. The dual-mode ensures nothing breaks.

**What could go wrong**:
- Super Admin impersonation (`try_super_admin_impersonation`) won't work with Supabase Auth -- it needs a dedicated Edge Function that uses `auth.admin.generateLink()` or `auth.admin.createUser()` to produce a session for the target user
- Force-logout (`force_logout_at`) must be replaced with `auth.admin.signOut(userId)` via Edge Function
- The 30-second polling check must call `supabase.auth.getUser()` instead of querying `public.users`

**Impersonation replacement**: An Edge Function `impersonate-user` that:
1. Validates the caller is Super Admin (checks `user_roles` table)
2. Generates a magic link or custom token for the target user
3. Returns it to the frontend, which calls `supabase.auth.signInWithPassword()` or redirects

---

### Phase 3: Migrate All localStorage Readers

**Goal**: Replace all `localStorage.getItem('userSession')` calls with Supabase session.

**Files affected** (25+ files):
- `src/lib/system-action-logger.ts` -- `getCurrentUserId()` 
- `src/hooks/useAdActionLog.ts` -- `getUserSession()`
- `src/components/terminal/users/TerminalUsersList.tsx`
- `src/components/terminal/users/UserConfigDialog.tsx`
- `src/components/terminal/users/BiometricManagementDialog.tsx`
- `src/components/AuthCheck.tsx` (can be deleted entirely)
- `src/pages/terminal/TerminalSettings.tsx` (uses different key, unrelated)
- Various other files reading session for user ID

**Pattern**: Replace:
```typescript
const sessionStr = localStorage.getItem('userSession');
const userId = sessionStr ? JSON.parse(sessionStr).id : null;
```
With:
```typescript
const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id ?? null;
```

**What could go wrong**:
- `getSession()` is async; some call sites are synchronous. These need refactoring to accept promises or use a React context
- `useTerminalAuth.tsx` already has its own context -- it will need to read from Supabase session instead of `useAuth` user object
- Non-React files (`system-action-logger.ts`) will need a module-level session cache updated by `onAuthStateChange`

---

### Phase 4: Tighten RLS Policies (The Security Fix)

**Goal**: Replace all `qual=true` / `public` / `anon` policies with proper `authenticated` + `auth.uid()` checks.

**Approach**: Table-by-table, in batches:
1. **Critical first**: `users`, `roles`, `user_roles`, `role_permissions`, `banking_credentials`
2. **Financial**: `bank_accounts`, `bank_transactions`, `purchase_orders`, `sales_orders`
3. **Operational**: `erp_tasks`, `erp_action_queue`, `shift_reconciliations`
4. **HR**: All `hr_*` tables
5. **Terminal**: All `terminal_*` and `p2p_*` tables
6. **Remaining**: Everything else

**Policy pattern for most tables**:
```sql
-- Drop old open policy
DROP POLICY "Allow all operations" ON public.some_table;

-- Read: any authenticated user
CREATE POLICY "Authenticated read" ON public.some_table
  FOR SELECT TO authenticated USING (true);

-- Write: authenticated + role check via security definer function
CREATE POLICY "Role-based write" ON public.some_table
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

For sensitive tables like `banking_credentials`:
```sql
CREATE POLICY "Super admin only" ON public.banking_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
```

**What could go wrong**:
- If Phase 2 fallback is still active and some users haven't migrated, they'll be blocked. Phase 4 should only execute after ALL users are confirmed on Supabase Auth
- Any SECURITY DEFINER RPC that accesses these tables will continue to work (they bypass RLS)
- The `validate_user_credentials` RPC is SECURITY DEFINER -- it will still work for any remaining legacy flows
- ~329 policies to rewrite -- this is the largest single effort

---

### Phase 5: Cleanup

**Goal**: Remove all legacy auth code.

**What gets removed**:
- `validate_user_credentials` RPC fallback path in `useAuth.tsx`
- `try_super_admin_impersonation` RPC (replaced by Edge Function)
- `LoginPage.tsx` hardcoded credentials
- `AuthCheck.tsx` component (replaced by Supabase session check)
- All `localStorage.getItem('isLoggedIn')`, `localStorage.getItem('userEmail')`, `localStorage.getItem('userRole')` references
- `password_hash` column from `public.users` (after confirming all auth is via Supabase)
- Registration flow updated: `create_user_with_password` RPC replaced with `supabase.auth.admin.createUser()` via Edge Function
- Password reset workflow updated to use `supabase.auth.resetPasswordForEmail()`

---

## Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users locked out during transition | High | Dual-mode login (Phase 2) ensures old path works |
| FK breakage from UUID mismatch | Critical | Phase 1 explicitly preserves UUIDs |
| Impersonation breaks | Medium | Edge Function built in Phase 2 before old path removed |
| RLS too restrictive blocks operators | High | Phase 4 done table-by-table with testing; rollback script for each batch |
| Password reset workflow breaks | Medium | Phase 5 only; existing `password_reset_requests` table can coexist |
| `force_logout_at` stops working | Medium | Replaced with `auth.admin.signOut()` Edge Function in Phase 2 |
| 35 junk auth.users cause conflicts | Low | Cleaned up in Phase 1 before creating real accounts |

## Data Integrity Guarantees

- `public.users` table is NEVER modified or deleted -- it remains the source of truth for user profiles
- All 73+ FK columns (`user_id`, `created_by`, `assigned_to`, etc.) continue pointing to the same UUIDs
- `auth.users.id` = `public.users.id` for all 19 users -- no mapping table needed
- Historical data (logs, orders, transactions) is completely untouched
- Roles/permissions system (`roles`, `user_roles`, `role_permissions`) data stays intact; only RLS policies change

## Estimated Effort Per Phase

| Phase | Effort | Can be deployed independently |
|-------|--------|-------------------------------|
| 1 - Create auth accounts | 1 day | Yes (no app changes) |
| 2 - Dual-mode login | 2-3 days | Yes (backward compatible) |
| 3 - Migrate localStorage readers | 1-2 days | Yes (after Phase 2) |
| 4 - Tighten RLS policies | 3-4 days | Yes (after Phase 3 confirmed) |
| 5 - Cleanup | 1 day | Yes (after Phase 4 stable) |
| **Total** | **8-11 days** | |

