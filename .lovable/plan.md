

# ERP Full System Audit — Phase 6 Report

## Phases 1-5 Status (completed)
- Phase 1: Data integrity, orphaned code, UI bugs — ALL FIXED
- Phase 2: Banking.tsx deleted, permission fix, dead code cleanup, website deletion, platforms seeded — ALL FIXED
- Phase 3: Permission gates (4 pages), demo-admin-id removed from usePermissions, localStorage writes cleaned, risk_management permissions added, reload removed from StepBySalesFlow — ALL FIXED
- Phase 4: All demo-admin-id references removed (useUsers, AuthCheck, system-action-logger), dead userPermissions localStorage write removed from LoginPage — ALL FIXED
- Phase 5: Hardcoded password removed, dead localStorage writes removed (userEmail/userRole from LoginPage/useAuth), all window.confirm/alert replaced with AlertDialog/toast across 7 files — ALL FIXED

---

## CATEGORY 1: SECURITY

### P6-SEC-01 | XSS vulnerability via dangerouslySetInnerHTML in TaskComments (HIGH)

`src/components/tasks/TaskComments.tsx` line 98 uses `dangerouslySetInnerHTML` to render comment content. The `displayContent` function applies a regex to convert `@[Name](id)` mentions into `<span>` elements, but does **zero sanitization** of the surrounding text.

If a user types `<img src=x onerror=alert(1)>` in a comment, it will execute as HTML. This is a stored XSS vector — comments are persisted in the database and rendered for all users viewing that task.

**Fix**: Escape HTML entities in the text **before** applying the mention regex, or switch to React elements instead of innerHTML.

### P6-SEC-02 | Stale localStorage removeItem calls for keys never written (LOW)

`useAuth.tsx` still calls `removeItem('userEmail')`, `removeItem('userRole')`, and `removeItem('userPermissions')` in two places (lines 225, 366-368) even though **no code writes these keys anymore** (removed in Phase 5). These are harmless no-ops but dead code.

**Fix**: Remove the 3 stale `removeItem` calls from useAuth.tsx (lines 225, 366-368).

---

## CATEGORY 2: TYPE SAFETY — `supabase as any` PATTERN (64 files)

### P6-TYPE-01 | Widespread `(supabase as any).from(...)` bypasses type checking (MEDIUM)

64 files use `(supabase as any)` to query HR/terminal tables that aren't in the generated Supabase types. This means:
- No autocomplete for column names — typos cause silent failures
- No type checking on insert/update payloads
- Missing columns don't surface at build time

This is a systemic issue across all Horilla (HR) modules, terminal modules, and some newer ERP tables. The root cause is that `src/integrations/supabase/types.ts` hasn't been regenerated after schema changes.

**Fix**: Regenerate the Supabase types file. This is a single command (`supabase gen types typescript`) that would eliminate all 64 files of `as any` casts. However, this requires the Supabase CLI to be connected. **Skip for now — flag for future sprint.**

---

## CATEGORY 3: DEAD CODE & CLEANUP

### P6-CLEAN-01 | 2,100+ console.log statements across 83 files (LOW)

Production-grade codebase contains extensive debug logging. While not harmful, it:
- Clutters browser console for end users
- Leaks internal operation details (wallet IDs, order data, user IDs)
- Some logs contain emoji prefixes (🗑️, 💰, ✅, 📝) indicating development-phase debugging

**Status**: LOW priority. Too many to fix in one phase. Flag for gradual cleanup.

### P6-CLEAN-02 | ShiftAttendanceTab delete is still a no-op (MEDIUM)

Phase 5 replaced `alert()` with `AlertDialog` but the `confirmDeleteShift` function still only does `console.log()` — it doesn't actually delete anything. The comment says "TODO: Wire up actual delete mutation when shifts are stored in DB."

**Fix**: Shifts appear to be hardcoded mock data (not from DB). The delete button should either be hidden or the shifts should be stored in the database. Need to verify if `hr_shifts` table exists.

### P6-CLEAN-03 | ForcedPasswordResetDialog still contains 'BlynkTemp2026!' (LOW — ACCEPTABLE)

`ForcedPasswordResetDialog.tsx` line 31 checks `newPassword === 'BlynkTemp2026!'` to prevent password reuse. This is acceptable because:
- The password is already known to the user (they just used it to log in)
- It's a UX guard, not a security mechanism
- The server-side `force_password_change` flag is the real control

**Status**: No fix needed.

---

## CATEGORY 4: ERROR HANDLING

### P6-ERR-01 | Silent empty catch blocks in 7 files (LOW)

7 files have `catch {}` or `catch { /* ignore */ }` blocks that silently swallow errors. Most are acceptable (best-effort operations like IP lookup, localStorage reads, WebSocket cleanup), but they should at minimum log to console for debuggability.

**Status**: LOW priority — all current instances are intentionally best-effort. No fix needed.

---

## IMPLEMENTATION PLAN

### Phase 6A — XSS fix (Critical, 5 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 1 | P6-SEC-01 | Escape HTML in TaskComments before rendering mentions via dangerouslySetInnerHTML | 5 min |

### Phase 6B — Dead code cleanup (5 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 2 | P6-SEC-02 | Remove stale removeItem('userEmail'/'userRole'/'userPermissions') from useAuth.tsx | 2 min |
| 3 | P6-CLEAN-02 | Verify shift storage and either wire up delete or hide button | 3 min |

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| XSS via dangerouslySetInnerHTML | 1 file | HIGH — stored XSS vector |
| Stale localStorage cleanup calls | 1 file, 5 calls | LOW — dead no-ops |
| `supabase as any` type bypass | 64 files | MEDIUM — systemic, needs type regen (deferred) |
| console.log pollution | 83 files, 2100+ calls | LOW — cosmetic (deferred) |
| No-op shift delete | 1 file | MEDIUM — misleading UX |

**Total effort: ~10 minutes for 3 fixes (1 critical, 2 cleanup)**

