## Goal

HRMS auto-adapts to the device it's opened on — no manual view toggles, no "flip back" affordances. Phones get a layout designed for phones; desktops keep the dense information-rich layout they have today. Both are first-class, neither is a fallback.

## Current state (verified)

- `useIsMobile()` hook already exists and is reactive to viewport width (breakpoint 768px).
- Global HRMS mobile CSS added last turn (table overflow, chip-row scroll strip, header/toolbar rules) is in `src/index.css` under `.horilla-root`.
- `EmployeeListPage` currently has a **manual List/Grid toggle** in the toolbar and only *defaults* to grid on mobile — user can still switch to the broken table view. This is the "flip back" the user wants removed.
- Many other HRMS pages (Attendance, Payslips, Leaves, Payroll, Candidates, Onboarding, Assets, Loans, Shifts, Docs) render desktop tables directly with no phone-native alternative — they rely purely on horizontal scroll today.

## What to build

### 1. Kill the manual view toggle on mobile

- On phones (`useIsMobile() === true`), the List/Grid toggle button in `EmployeeListPage` is not rendered and `viewMode` is locked to `"grid"` (card layout).
- On desktop, the toggle disappears entirely too — desktop always shows the table. Users don't need to pick; the device decides.
- Same rule applied anywhere else in HRMS that exposes a similar view switcher.

### 2. Introduce a single primitive: `<ResponsiveList>`

A small wrapper that takes the same row data twice — a `renderRow` for the desktop table body and a `renderCard` for the mobile card — and picks one based on `useIsMobile()`. Pages stop maintaining two branches manually. Column headers, empty state, loading skeleton, and pagination are shared.

### 3. Migrate Tier-1 pages to `<ResponsiveList>` with real phone card layouts

Not just horizontal scroll — actual card designs that surface the 3–4 fields that matter on a phone, with the rest available via row tap → detail sheet/drawer. Tier-1 set:

- Employees (retire the existing bespoke grid, move it inside `ResponsiveList`)
- Attendance Overview + daily punches
- Payslips list + Payslip History Import
- Leave Requests + Leave Balances
- Payroll Runs list
- Onboarding Dashboard
- Employee Profile (already partly responsive — tighten tabs strip + info grid)

### 4. Tier-2 pages get the `ResponsiveList` treatment in a follow-up pass

Recruitment (Candidates, Interviews, Stages), Loans, Assets, Documents, Shifts, Biometric Devices, Regularization queue, Period Locks, Announcements. Same primitive, same pattern — mechanical migration once Tier-1 is proven.

### 5. Tier-3 config pages stay table-only

Rules, permissions, tax slabs, statutory config, integrations — these are admin-only, rarely opened on a phone. They keep horizontal scroll (already handled by the global CSS from last turn) and don't get card variants. Documented as an explicit choice, not an oversight.

### 6. Global polish, applied via CSS only

- HRMS header/toolbar: compact spacing on mobile, full spacing on desktop — driven by media queries, not JS.
- Filter chip rows: already use `.hrms-chip-row` for horizontal scroll; audit remaining pages and tag their chip strips.
- Modal/Sheet: dialogs that today overflow on phones (Salary Revision, Onboarding stages, Payslip detail) switch to bottom-sheet presentation via a `Drawer` on mobile, `Dialog` on desktop — one wrapper component.
- Sidebar: already collapses to a Sheet on mobile via `HorillaLayout`; verify trigger button placement is thumb-reachable.

## Explicitly out of scope

- No changes to business logic, RPCs, engines, payroll math, or edge functions.
- No changes to ERP module (only `/hrms` pages).
- No manual "desktop mode" escape hatch on phones — the user's directive is that the device decides.

## Technical notes

- Detection: `useIsMobile()` (already reactive to `resize`). SSR-safe default = desktop, hydration fixes it — same as today.
- `ResponsiveList` lives at `src/components/horilla/primitives/ResponsiveList.tsx`.
- Mobile drawer wrapper lives at `src/components/horilla/primitives/ResponsiveDialog.tsx` using existing shadcn `Drawer` + `Dialog`.
- No breakpoint changes — 768px stays the phone/desktop line.
- No new dependencies.

## Rollout order

1. Add `ResponsiveList` + `ResponsiveDialog` primitives.
2. Remove the manual toggle from `EmployeeListPage`, port it onto `ResponsiveList`.
3. Migrate the remaining Tier-1 pages one by one.
4. Report back; then do Tier-2 in a follow-up.
