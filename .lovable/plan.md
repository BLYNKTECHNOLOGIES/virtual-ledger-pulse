## Goal
Make HRMS automatically render correctly on mobile, tablet, and desktop — no manual view toggle, no clipped cards, no page shifted sideways, and no desktop tables forced into phone screens.

## Confirmed current problems from code audit
- `EmployeeProfilePage.tsx` still uses desktop-heavy profile cards, large padding, pill tabs, and embedded tables; this matches the uploaded screenshot where the profile content is horizontally clipped.
- 33 HRMS page files still render raw `<table>` layouts.
- 45 HRMS files/components still use desktop `DialogContent` patterns.
- 42 HRMS pages/components use fixed two-column grid patterns that need phone-first behavior.
- `HorillaLayout.tsx` already has a shared HRMS shell, so the cleanest fix is shared responsive foundations plus targeted migration of high-traffic pages.

## Implementation plan

### 1. Fix the HRMS shell and global responsive rules
- Update `HorillaLayout.tsx` so the main content area cannot create sideways page overflow on phones.
- Tighten `HorillaHeader.tsx` for 390px screens: compact search, safe notification/profile buttons, no clipped input.
- Improve `PageHeader.tsx` action layout so page buttons stack full-width on mobile and remain compact on desktop.
- Replace broad fragile mobile CSS with clearer HRMS utilities:
  - `.hrms-page`
  - `.hrms-toolbar`
  - `.hrms-chip-row`
  - `.hrms-scroll-table`
  - `.hrms-mobile-stack`

### 2. Repair the Employee Profile page first
- Rebuild the top profile header for mobile:
  - compact avatar
  - name/email/phone allowed to wrap/truncate safely
  - prev/next buttons anchored cleanly
  - no horizontal clipping
- Convert breadcrumbs into a mobile-safe compact trail/back affordance.
- Make the tab row a horizontal scroll strip on mobile and normal pill layout on desktop.
- Convert About/Work/Documents/Lifecycle info grids to true one-column mobile cards.
- Convert Work Info, Assets, Attendance, and Payslips sections to responsive cards on mobile and dense tables on desktop.
- Keep desktop profile rich and table-based where appropriate.

### 3. Migrate high-traffic HRMS pages to real responsive lists
Apply the existing `ResponsiveList` primitive, with card rendering on mobile and table rendering on desktop, to:
- Employees
- Attendance Overview
- Attendance Punches / Summary where applicable
- Leave Requests
- Payslips
- Payroll dashboard/history views
- Biometric Devices
- Onboarding Pipeline
- Candidate/Recruitment lists

### 4. Make forms and dialogs mobile-native
- Use `ResponsiveDialog` for creation/edit flows that are cramped on phones.
- Convert two-column form grids to one-column on mobile.
- Make dialog bodies scroll within viewport and keep primary actions reachable.
- Apply this to employee add/edit, leave, attendance, payslip/payment, onboarding, recruitment, shift, asset, and config dialogs.

### 5. Clean up remaining HRMS pages in batches
Audit and patch all remaining `src/pages/horilla/*.tsx` pages by pattern:
- Dashboards: responsive stat grids and non-overflowing charts/cards.
- Admin/config pages: scroll-safe tables and mobile sheet dialogs.
- Payroll/tax pages: preserve dense desktop tables, mobile cards/scroll where data is too wide.
- Recruitment/assets/documents/helpdesk/performance pages: card-first mobile layout, table-first desktop layout.

### 6. Visual verification
- Test representative routes at:
  - 390px mobile
  - 768px tablet
  - 1280px desktop
- Specifically verify:
  - no horizontal page scrolling unless inside an intentional table strip
  - profile screenshot issue is resolved
  - action buttons remain tappable
  - tabs/chips scroll naturally
  - desktop remains dense and professional

## Scope boundary
This is a frontend/UI responsiveness pass only. I will not change HRMS business logic, payroll calculations, attendance logic, database schema, or permissions.