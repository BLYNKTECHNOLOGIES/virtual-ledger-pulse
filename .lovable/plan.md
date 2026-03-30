

# ERP Full System Audit — Phase 5 Report

## Phases 1-4 Status (completed)
- Phase 1: Data integrity, orphaned code, UI bugs — ALL FIXED
- Phase 2: Banking.tsx deleted, permission fix, dead code cleanup, website deletion, platforms seeded — ALL FIXED
- Phase 3: Permission gates (4 pages), demo-admin-id removed from usePermissions, localStorage writes cleaned from usePermissions, risk_management permissions added, reload removed from StepBySalesFlow — ALL FIXED
- Phase 4: All demo-admin-id references removed (useUsers, AuthCheck, system-action-logger), dead userPermissions localStorage write removed from LoginPage — ALL FIXED

---

## CATEGORY 1: SECURITY

### P5-SEC-01 | Hardcoded temporary password in client-side code (HIGH)

`LoginPage.tsx` line 114 contains `password === 'BlynkTemp2026!'` — the temporary onboarding password is exposed in client-side JavaScript. Anyone can view-source and find it. The `ForcedPasswordResetDialog.tsx` also references it (line 31) to prevent reuse.

The `force_password_change` DB column check is sufficient. The client-side string comparison is redundant and leaks the password.

**Fix**: Remove the `|| password === 'BlynkTemp2026!'` check from LoginPage.tsx. Keep the `ForcedPasswordResetDialog.tsx` reference (it prevents reuse, which is a valid client-side UX guard — the password is already known to the user at that point).

### P5-SEC-02 | Dead localStorage writes: userEmail and userRole (MEDIUM)

Both `LoginPage.tsx` (lines 94-96) and `useAuth.tsx` (lines 88-90) write `userEmail` and `userRole` to localStorage. **Neither is ever read** (confirmed: zero `getItem('userEmail')` and zero `getItem('userRole')` calls exist).

Only `isLoggedIn` and `userSession` are actually read (by `AuthCheck.tsx`).

**Fix**: Remove `localStorage.setItem('userEmail', ...)` and `localStorage.setItem('userRole', ...)` from both files. Keep `isLoggedIn` and `userSession` (still read by AuthCheck).

---

## CATEGORY 2: UX — NATIVE BROWSER DIALOGS (carried from Phase 4)

### P5-UX-01 | Replace window.confirm with AlertDialog (5 locations)

| File | Action | Current |
|------|--------|---------|
| `UserManagement.tsx` | Delete user | `window.confirm(...)` |
| `UserManagement.tsx` | Delete role | `window.confirm(...)` |
| `WalletManagementTab.tsx` | Delete wallet | `window.confirm(...)` |
| `TerminalUsersList.tsx` | Remove role | `window.confirm(...)` |
| `TerminalAccessTab.tsx` | Remove role | `window.confirm(...)` |

**Fix**: Replace each with a state-driven `AlertDialog` matching the existing pattern used throughout the app.

### P5-UX-02 | Replace alert() with toast (3 locations)

| File | Line | Current | Fix |
|------|------|---------|-----|
| `ShiftAttendanceTab.tsx` | 48 | `alert('Delete shift: ...')` — placeholder that does nothing | Wire up actual delete mutation with confirmation dialog |
| `UserManagement.tsx` | 301 | `alert('You do not have permission...')` | Replace with `toast` |
| `DirectoryTab.tsx` | 494 | `alert('Error generating PDF...')` | Replace with `toast` |

---

## CATEGORY 3: BIOMETRIC CREDENTIAL DIALOGS

### P5-UX-03 | BiometricManagementDialog — window.confirm for credential deletion (LOW)

Two `window.confirm` calls (lines 122 and 146) for deleting biometric credentials. Should use AlertDialog for consistency.

**Fix**: Add AlertDialog state for single + bulk credential deletion.

---

## IMPLEMENTATION PLAN

### Phase 5A — Security fixes (10 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 1 | P5-SEC-01 | Remove hardcoded `BlynkTemp2026!` comparison from LoginPage.tsx | 2 min |
| 2 | P5-SEC-02 | Remove dead `userEmail` and `userRole` localStorage writes from LoginPage.tsx and useAuth.tsx | 3 min |

### Phase 5B — Replace native dialogs with AlertDialog (20 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 3 | P5-UX-01 | Add AlertDialog to UserManagement.tsx (delete user + delete role) | 5 min |
| 4 | P5-UX-01 | Add AlertDialog to WalletManagementTab.tsx (delete wallet) | 3 min |
| 5 | P5-UX-01 | Add AlertDialog to TerminalUsersList.tsx (remove role) | 3 min |
| 6 | P5-UX-01 | Add AlertDialog to TerminalAccessTab.tsx (remove role) | 3 min |
| 7 | P5-UX-02 | Replace alert() with toast in UserManagement.tsx and DirectoryTab.tsx | 2 min |
| 8 | P5-UX-02 | Wire up actual shift delete in ShiftAttendanceTab.tsx (replace placeholder alert) | 4 min |
| 9 | P5-UX-03 | Add AlertDialog to BiometricManagementDialog.tsx | 3 min |

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Hardcoded password in client code | 1 file | HIGH — password visible in source |
| Dead localStorage writes | 2 files, 4 writes | MEDIUM — misleading, no harm |
| Native browser dialogs (confirm/alert) | 7 files, 10 instances | LOW — functional but inconsistent |

**Total effort: ~30 minutes for 9 fixes**

