# HRMS Mobile Optimization Plan

HRMS has 67 pages, most built around wide desktop tables. On phones these overflow horizontally, filter chips wrap awkwardly, action buttons get clipped, and headers steal vertical space. Rewriting each page individually is unrealistic in one shot, so this plan combines one shared primitive with a prioritized rollout.

## Approach

### 1. Shared `ResponsiveTable` primitive (foundation)
Add `src/components/hrms/primitives/ResponsiveTable.tsx`:
- Desktop (≥ md): renders the existing `<Table>` unchanged.
- Mobile (< md): renders each row as a stacked card — primary cell as the card title, remaining columns as label/value rows, actions collapsed into an overflow menu.
- Column config drives both views (label, render, `mobilePrimary`, `mobileHidden`, `mobileLabel`).
- Sticky search/filter bar, condensed spacing, tap-safe 44px targets.

Also add `MobilePageHeader` (compact title + inline action button) and standardize filter chips into a horizontal scroll strip so they never wrap into 3 rows.

### 2. HorillaLayout mobile polish
- Reduce top padding on mobile, remove desktop-only side gutters.
- Header search collapses into an icon → sheet on `< sm`.
- Sidebar already a Sheet on mobile — confirm all tabs reachable in ≤ 2 taps.

### 3. Page rollout (staged)

Tier 1 — highest traffic (this turn):
```text
EmployeeListPage       AttendanceOverviewPage    PayslipsPage
LeaveRequestsPage      SalaryRevisionsPage       PayrollDashboardPage
HorillaDashboard       EmployeeProfilePage       AttendancePunchesPage
BiometricDevicesPage
```

Tier 2 — next turn: Recruitment (Candidates, Interviews, Pipeline), Onboarding, Separation/FnF, Loans, Assets, Documents, Holidays, Shifts.

Tier 3 — final pass: Config/admin pages (Salary Components, Tax Config, Leave Types, Policies, Departments, Positions, Weekly Off, Penalty rules, MPI, Reports).

Each page gets:
- `ResponsiveTable` swap
- Header collapsed to `MobilePageHeader` on `< sm`
- Filter row → horizontal scroll chip strip
- Bulk-action bar → sticky bottom sheet on mobile
- Dialogs already responsive — audit only

## Technical notes

- Breakpoint: Tailwind `md` (768px) is the switch; use `useIsMobile` where JS logic is needed.
- No new libraries; reuse shadcn `Card`, `Sheet`, `DropdownMenu`, `ScrollArea`.
- Column visibility state on `EmployeeListPage` is preserved — mobile view just ignores the "always hidden on mobile" flag.
- No business logic, RLS, or query changes.
- Preview viewport switched to mobile during this work; user can flip back with the device toggle above the preview.

## Out of scope

- Dialogs/forms already using shadcn responsive primitives (leave as-is unless a Tier-1 audit reveals overflow).
- HRMS dark theme (already shipped).
- ERP profile self-service view (already mobile-tuned).

## Deliverable order in this turn

1. `ResponsiveTable` + `MobilePageHeader` primitives
2. Tier 1 pages migrated
3. Global filter-chip strip helper
4. Screenshot verify Employees + Attendance + Payslips in mobile viewport

Tier 2 and Tier 3 ship in follow-up turns after Tier 1 is confirmed.
