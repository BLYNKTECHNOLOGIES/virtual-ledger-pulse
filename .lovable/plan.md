# ERP Full System Audit — Phase 2 Report

## Phase 1 Status (completed)

- Phase 1A: Duplicate header, CSV column shift, dead HRMS import -- ALL FIXED
- Phase 1B: 5 orphaned files deleted (~2,500 lines removed) -- ALL FIXED
- Phase 1D: Accounting tabs marked "Coming Soon" -- DONE
- Phase 1C (pending business decision): KUCOIN balance still -493.62, 22 duplicate phone sets still exist, platforms table still empty

---

## CATEGORY 1: CRITICAL UI BUG

### P2-UI-01 | Banking.tsx is entirely hardcoded static data with wrong title

`src/pages/Banking.tsx` (176 lines) is routed at `/banking` in `App.tsx` but:

- Title says "Sales Management" instead of "Banking"
- Contains 3 hardcoded static transaction objects (GAGANDEEP SINGH BHOGAL, shadab, PHIAMPHU)
- Form fields are uncontrolled (no state bindings, no submit handler)
- NOT in the sidebar navigation — users can only reach it via direct URL
- The BAMS module (`/bams`) is the actual banking management system

**Verdict**: This is a legacy stub page that was superseded by BAMS. It should be deleted and its route removed from `App.tsx`.

---

## CATEGORY 2: ORPHANED CODE (Phase 2)

### P2-DC-01 | `src/components/ems/` — 2 orphaned employee dialog components

`AddEmployeeDialog.tsx` and `ComprehensiveAddEmployeeDialog.tsx` are never imported by any file outside their own directory. The Horilla HRMS module uses its own `@/components/horilla/employee/AddEmployeeDialog.tsx` instead.

**Fix**: Delete the entire `src/components/ems/` directory (2 files).

### P2-DC-02 | `src/components/payroll/CompliancePayrollTab.tsx` — never imported

This component exists but is never imported by any other file in the project.

**Fix**: Delete the file.

### P2-DC-03 | `src/components/letterhead/` — 2 orphaned letterhead components

`CompanyLetterhead.tsx` and `OfferLetterMockup.tsx` only reference each other and are never imported by any other file in the project.

**Fix**: Delete the entire `src/components/letterhead/` directory (2 files).

### P2-DC-04 | `src/components/website/` — 37 website pages with only 1 used

The `src/components/website/` directory contains 38 files (37 page components + 18 shared components). Only `LoginPage.tsx` is imported by `App.tsx`. None of the other 55+ files are imported anywhere in the application:

- 36 public website pages (HomePage, AboutPage, CareersPage, OTCDeskPage, VASPPage, etc.)
- 18 shared components (Navbar, Footer, HeroSection, etc.)

These appear to be a customer-facing marketing website that was scaffolded but never wired to any routes.

**Fix**: This is ~5,000+ lines of dead code. However, these may be intended for a future public website. **Requires business decision** — delete if the public website is hosted separately, keep if planned for integration.

---

## CATEGORY 3: DATA INTEGRITY (Phase 1C — still pending)

### P2-DI-02 | 22 duplicate client phone number sets (unchanged)

22 phone numbers are shared by multiple clients. Top offenders have 4 clients sharing one number.

**Action needed**: Data cleanup before adding unique index. Need business decision on merge strategy.

### P2-DI-03 | Platforms table: 0 rows, blocks Sales workflow

`platforms` table is actively queried by `SalesOrderDialog` and `OrderCompletionDialog` but has 0 rows. Platform dropdown is always empty.

**Action needed**: Seed with default platforms (e.g., 'Binance', 'KuCoin') or remove the platform field from Sales/KYC dialogs. elaborate

---

## CATEGORY 4: MINOR UI ISSUES

### P2-UI-02 | Risk Management uses `compliance_view` permission

`RiskManagement.tsx` line 68 gates on `compliance_view` permission, but the sidebar entry uses `risk_management_view`. This means a user with `risk_management_view` (but not `compliance_view`) can see the sidebar link but gets "Access Denied" when they click it.

**Fix**: Change the PermissionGate in `RiskManagement.tsx` to use `risk_management_view` instead of `compliance_view`.

### P2-UI-03 | Risk Management uses `window.location.reload()` instead of query invalidation

Line 60 in `RiskManagement.tsx` does a full page reload after running risk detection. Should use `queryClient.invalidateQueries()` for a smoother UX.

**Fix**: Replace `window.location.reload()` with query invalidation.

---

## IMPLEMENTATION PLAN

### Phase 2A — Critical Fixes (implement now)

1. **P2-UI-01**: Delete `Banking.tsx` and remove its route from `App.tsx`
2. **P2-UI-02**: Fix RiskManagement permission gate (`compliance_view` → `risk_management_view`)
3. **P2-UI-03**: Replace `window.location.reload()` with query invalidation in RiskManagement

### Phase 2B — Dead Code Cleanup

4. Delete `src/components/ems/` directory (2 files)
5. Delete `src/components/payroll/CompliancePayrollTab.tsx`
6. Delete `src/components/letterhead/` directory (2 files)

### Phase 2C — Data Integrity (Phase 1C carryover, requires business decision)

7. **P2-DI-01**: KUCOIN reconciliation not requried
8. **P2-DI-02**: Client phone dedup + unique index
9. **P2-DI-03**: Seed platforms table elaborate consequences

### Phase 2D — Business Decision Required

10. **P2-DC-04**: Website components (~5,000 lines) — delete or keep for future public site?

---

## Summary


| Category                       | Count                 | Severity                                         |
| ------------------------------ | --------------------- | ------------------------------------------------ |
| Critical UI (static fake page) | 1                     | HIGH — Banking.tsx is completely non-functional  |
| Orphaned code (new finds)      | 7 files + website dir | MEDIUM — ~500 lines + ~5,000 website lines       |
| Permission mismatch            | 1                     | MEDIUM — users see sidebar but get Access Denied |
| Data integrity (carryover)     | 3                     | HIGH — still pending business decisions          |
| UX improvements                | 1                     | LOW — page reload vs query invalidation          |
