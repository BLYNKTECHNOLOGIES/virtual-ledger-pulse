# Self-Registration → Super-Admin Approval

## Goal
On the ERP staff login page, add a **Register** option that opens the full user form (first name, last name, username, email, phone, badge ID, password, confirm password). Submissions go to the existing **Pending Approvals** queue, which becomes **Super Admin only**. At approval the Super Admin assigns **Role + Department + Position** (the registrant never sets these).

## What already exists (reused, not rebuilt)
- `pending_registrations` table + `PendingRegistrationsTab` (approve/reject UI)
- `approve_registration` / `reject_registration` RPCs
- `create-erp-user` edge function and password-hashing conventions

## Changes

### 1. Database migration
- Add to `pending_registrations`: `badge_id text`, `department_id uuid`, `position_id uuid` (all nullable). `badge_id` is filled by the registrant; `department_id`/`position_id` are written at approval.
- Update `approve_registration` RPC to accept `p_department_id uuid` and `p_position_id uuid` in addition to the existing `p_role_id`. On approval it sets the created user's `badge_id` (from the registration), `department_id`, and `position_id`, keeping the current role assignment behavior. Keep `search_path = public, extensions` so hashing helpers resolve.
- Re-confirm GRANTs on `pending_registrations` (anon needs INSERT only via the edge function/service role — the public form will go through an edge function, so no broad anon grant is added).

### 2. Edge function: `register-erp-user` (public, `verify_jwt = false`)
- Accepts: first_name, last_name, username, email, phone, badge_id, password.
- Validates input with zod (required fields, password length ≥ 6, email format).
- **Uniqueness guard** (reuses the email/phone safety rules already added for user creation): rejects if the email or normalized phone already exists in `public.users` OR in non-rejected `pending_registrations`. Returns a friendly error.
- Hashes the password with `extensions.crypt(...)` (service role), inserts a `pending_registrations` row with `status = 'PENDING'`.
- Returns success/failure; never exposes the hash.

### 3. Login page — Register option
- `src/components/website/pages/LoginPage.tsx`: add a **"Register"** link/button under the Sign In form that opens a new `RegisterUserDialog`.

### 4. New component: `RegisterUserDialog`
- Form fields: First Name, Last Name, Username*, Email*, Phone, Badge ID, Password*, Confirm Password*.
- No department/position fields (assigned later by Super Admin).
- Client-side validation (required, password match, length); calls `register-erp-user` via `supabase.functions.invoke`.
- On success shows a "Registration submitted — pending Super Admin approval" confirmation and closes.

### 5. Pending Approvals — Super Admin only + dept/position at approval
- `src/pages/UserManagement.tsx`: gate the **Pending Approvals** tab (trigger + content) to `hasRole('super admin')` only, hiding it from all other roles.
- `src/components/user-management/PendingRegistrationsTab.tsx`:
  - Guard render with a Super-Admin check (defense in depth) — non-super-admins see an access message.
  - Show **Badge ID** on each pending card and in the approval dialog.
  - In the approval dialog add **Department** and **Position** selects (Position filtered by chosen Department, same pattern as `AddUserDialog`), alongside the existing **Role** select. All three required to approve.
  - Pass `p_department_id` / `p_position_id` into the updated `approve_registration` RPC call.

## Technical notes
- Super Admin detection uses existing `hasRole('super admin')` from `useAuth`.
- Phone normalization/uniqueness mirrors the rules already applied in `create-erp-user` and `useUsers` to stay consistent.
- No Binance scope involved.

## Verification
- Submit a registration from the login page → row appears in Pending Approvals for a Super Admin only.
- Non-super-admin cannot see the tab.
- Approve with role+department+position → user created with those values and can log in; duplicate email/phone is blocked at registration.
