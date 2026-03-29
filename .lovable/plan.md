

# ERP Account Creation in Onboarding Stage 5

## Summary

Implement the ERP account creation logic in the `handleFinalize` function of `OnboardingWizard.tsx`. When "Create ERP Account" is toggled on, the system will create a Supabase Auth user, a `public.users` record, assign the selected role via `user_roles`, and email credentials via `send-hr-email`.

## What Happens Today

The TODO block at lines 215-219 of `OnboardingWizard.tsx` only logs an audit entry — no user is actually created.

## Implementation

### 1. New Edge Function: `create-erp-user`

A new Edge Function that handles the full ERP user creation securely using the service role key:

**Input**: `{ firstName, lastName, email, phone, departmentId, positionId, roleId, badgeId, callerUserId }`

**Logic**:
1. Validate caller is admin/super_admin (same pattern as `admin-reset-password`)
2. Generate username: `firstname + lastname` (lowercase, no spaces). If duplicate exists, append a number
3. Generate a random 12-char password
4. Create auth user via `adminClient.auth.admin.createUser({ email, password, email_confirm: true })`
5. Create `public.users` record with: `id` = auth user id, `username`, `email`, `first_name`, `last_name`, `phone`, `badge_id`, `role_id`, `password_hash` = 'SUPABASE_AUTH', `status` = 'ACTIVE'
6. Insert into `user_roles`: `{ user_id, role_id, assigned_by: callerUserId }`
7. Return `{ userId, username, tempPassword }`

### 2. Update `OnboardingWizard.tsx` — handleFinalize (lines 215-219)

Replace the TODO block with:
1. Call `create-erp-user` Edge Function with Stage 1 data + Stage 5 role selection
2. On success, send credentials email via `send-hr-email` containing:
   - ERP login URL (from `window.location.origin`)
   - Username
   - Temporary password
   - "You will be required to change your password on first login"
3. Log audit: `erp_account_created` with the new user ID

### 3. First Login Password Change Enforcement

Add a `force_password_change` column to `public.users` table (boolean, default false). The `create-erp-user` function sets it to `true`. The existing auth flow checks this flag and redirects to a password change screen.

### 4. Migration

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_password_change boolean DEFAULT false;
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/create-erp-user/index.ts` | New — Edge Function for secure user creation |
| `supabase/migrations/xxx.sql` | Add `force_password_change` column |
| `src/components/hrms/onboarding-pipeline/OnboardingWizard.tsx` | Replace TODO with actual ERP creation + email logic |
| Auth flow component (login page) | Add force password change check |

## Security

- Edge Function validates caller is admin/super_admin before creating users
- Admin/Super Admin roles cannot be assigned (filtered in UI already + validated in Edge Function)
- Password is generated server-side, never exposed in client logs
- Uses service role key only within the Edge Function

