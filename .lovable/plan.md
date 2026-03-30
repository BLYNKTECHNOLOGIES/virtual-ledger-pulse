

# ERP Full System Audit — Phase 9 Report

## Phases 1-8 Status (completed)
- Phase 1-4: Data integrity, orphaned code, permissions, demo-admin cleanup — ALL FIXED
- Phase 5: Hardcoded password, dead localStorage, native dialogs replaced — ALL FIXED
- Phase 6: XSS fix, stale removeItems, shift delete cleanup — ALL FIXED
- Phase 6.5: Buy Orders/Pending/Review tabs removed, 25 files deleted, dead DB columns + trigger dropped — ALL FIXED
- Phase 7: 3 dead DB tables dropped, dead `useIsOrderFocused` removed, `window.location.reload()` replaced in EditUserDialog — ALL FIXED
- Phase 8: 2 orphaned HRMS files deleted, OrderFocusContext fully removed, empty import + stale localStorage + duplicate session writes cleaned — ALL FIXED

---

## CATEGORY 1: ORPHANED HOOKS (never imported anywhere)

### P9-DEAD-01 | useOperatorModule.ts — 161 lines, zero imports (DELETE)

`src/hooks/useOperatorModule.ts` exports `useOperatorAssignments`, `useCreateOperatorAssignment`, `useDeleteOperatorAssignment`, and `useAutoAssignOperator`. **No file imports from this module.** The underlying table (`terminal_operator_assignments`) is queried directly in `TerminalMPI.tsx` and `TerminalOperatorDetail.tsx` — they do not use this hook.

### P9-DEAD-02 | useValidation.tsx — 121 lines, zero imports (DELETE)

`src/hooks/useValidation.tsx` wraps `@/utils/validations` with toast error handling. **Never imported.** The underlying `@/utils/validations` is imported directly where needed (TransactionForm, TransferForm). This hook is an unused wrapper layer.

### P9-DEAD-03 | useStockValidation.tsx — 31 lines, zero imports (DELETE)

`src/hooks/useStockValidation.tsx` is a smaller wrapper around `validateProductStock` from `@/utils/validations`. **Never imported.** Same pattern as above — dead wrapper.

### P9-DEAD-04 | usePerformance.tsx — 20 lines, zero imports (DELETE)

`src/hooks/usePerformance.tsx` sets up a `PerformanceObserver` for Core Web Vitals logging. **Never imported.** It only writes to `console.log` — pure dead instrumentation code.

### P9-DEAD-05 | useOptimizedQueries.tsx — 109 lines, zero imports (DELETE)

`src/hooks/useOptimizedQueries.tsx` exports `useProducts`, `useBankAccounts`, `usePaymentMethods`, `useWarehouses`. **Never imported.** These queries are done inline or via other hooks throughout the app.

---

## CATEGORY 2: ORPHANED UTILS (never imported)

### P9-DEAD-06 | debugAuth.ts — 36 lines, zero imports (DELETE)

`src/utils/debugAuth.ts` is a debug utility that dumps Supabase auth state to console. **Never imported.** Development artifact that should not ship.

### P9-DEAD-07 | lazyLoad.ts — 16 lines, zero imports (DELETE)

`src/utils/lazyLoad.ts` provides a `lazyLoad()` wrapper around React.lazy. **Never imported.** The app uses direct `lazy()` calls or no code splitting at all.

---

## CATEGORY 3: SYSTEMIC ISSUES (DEFERRED)

### P9-TYPE-01 | 64 files use `(supabase as any)` — type safety bypass (DEFERRED)
Needs Supabase type regeneration. Tracked since Phase 6.

### P9-LOG-01 | 2,000+ console.log across 79+ files (DEFERRED)
Too many for one phase. Gradual cleanup over future phases.

---

## IMPLEMENTATION PLAN

### Phase 9A — Delete orphaned hooks (2 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 1 | P9-DEAD-01 | Delete `src/hooks/useOperatorModule.ts` (161 lines) | 30s |
| 2 | P9-DEAD-02 | Delete `src/hooks/useValidation.tsx` (121 lines) | 30s |
| 3 | P9-DEAD-03 | Delete `src/hooks/useStockValidation.tsx` (31 lines) | 30s |
| 4 | P9-DEAD-04 | Delete `src/hooks/usePerformance.tsx` (20 lines) | 30s |
| 5 | P9-DEAD-05 | Delete `src/hooks/useOptimizedQueries.tsx` (109 lines) | 30s |

### Phase 9B — Delete orphaned utils (1 min)

| # | Bug ID | Fix | Effort |
|---|--------|-----|--------|
| 6 | P9-DEAD-06 | Delete `src/utils/debugAuth.ts` (36 lines) | 30s |
| 7 | P9-DEAD-07 | Delete `src/utils/lazyLoad.ts` (16 lines) | 30s |

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Orphaned hooks (never imported) | 5 files (442 lines) | MEDIUM — dead weight, misleading |
| Orphaned utils (never imported) | 2 files (52 lines) | LOW — dead weight |

**Total: 7 files deleted, ~494 lines removed, ~3 minutes effort**

No database changes needed. No other files reference these — clean deletions with zero risk.

### Technical Details

All 7 files were verified by searching for `import.*from.*@/hooks/<name>` and `import.*from.*@/utils/<name>` across the entire `src/` directory. Each returned zero matches. The underlying functionality they wrap (Supabase queries, validation utils) is accessed directly elsewhere — these are purely redundant abstraction layers that were never wired in.

