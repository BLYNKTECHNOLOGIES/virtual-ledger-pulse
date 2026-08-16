# Employee Profile — Enterprise Redesign (frontend only)

Redesign the employee profile experience (`/profile`) into a dense, restrained, production-grade ERP surface. No schema, query, calculation, permission, route or functionality changes — presentation and interaction polish only.

## What exists today

- `src/pages/UserProfile.tsx` (~1,710 lines) holds the header, the 13-tab navigation and four inline sub-tabs: Banking, Salary & PF, Payslips, Documents.
- Remaining tabs render existing components: `UserProfileTasks`, `AttendanceTab`, `MyRequestsHub`, `TeamLeaveApprovals`, `TeamRegularizationApprovals`, `MyAssetsTab`, `MyPoliciesCard`, `MyHelpdeskCard`, `MyLoansCard`, `MyTeamCard`, `MyAnnouncementsCard`, `MyMilestonesCard`, `OrgLeaveCalendarCard`, `UpcomingHolidaysCard`, `CompensationHistory`.
- A design-system layer already exists in `src/index.css` (`t-page-title`, `t-section`, `t-card-title`, `t-body`, `t-secondary`, `t-label`, `t-kpi`, `ds-surface`, `ds-table-wrap`, `ds-table`, `ds-num`, spacing/radius/motion variables) plus shared primitives `StatCard`, `SectionHeader`, `DataTableShell`. The profile page does not use any of them yet.
- Current issues to remove: full-width saturated blue gradient banner, pill tab bar, card-in-card stacks, hardcoded hex colors (`#00bcd4` labels, `#E8604C` buttons, `border-l-amber-400`/`green-500`/`red-500` rows), oversized empty states, one card per leave type, low information density.

## Design foundation (extend, don't reinvent)

Add a profile layer on top of the existing tokens:

- `ds-field` / `ds-field-grid` — label-over-value information grid (2-col desktop, 4-col wide, 1-col mobile) replacing the repeated "label above value with a divider" pattern.
- `ds-panel` / `ds-panel-head` — light bordered group used instead of `Card` where a section only needs a boundary, not a card.
- `ds-money` — tabular-nums, right-aligned currency cell with consistent `₹` formatting.
- `ds-status` — small text-first status chip with the five semantic tones (success / warning / destructive / info / neutral); no large colored circles.
- `ds-subnav` — underline-style tab strip (active = 2px BLYNK accent underline + foreground text) replacing rounded pills; horizontally scrollable with edge fade on narrow widths.

New presentational components under `src/components/profile/primitives/`:
`ProfileHeader`, `FieldGrid` + `Field`, `SectionBlock`, `MoneyRow`, `StatusPill`, `ProfileEmptyState`, `ProfileSubnav`.

All colors come from existing semantic tokens; every hardcoded hex in the profile module is replaced with a token equivalent.

## Section-by-section changes

**Identity header** — replace the blue gradient hero with a compact record header: avatar (small), name as page title, badge ID / position / department / status pill inline, contact metadata (email, phone, gender) as quiet inline items, thin accent rule instead of a saturated background. Same information, roughly half the vertical space.

**Navigation** — underline sub-nav with all 13 existing tabs, unchanged values and behavior.

**Profile tab** — Identity & Contact, Statutory IDs and Work Information become field grids inside titled sections rather than three cards; masked statutory values stay monospaced with the existing privacy note. Team / Announcements / Milestones keep their components, wrapped in consistent section headers.

**Salary & PF** — financial-system treatment: Annual CTC / Monthly CTC as an aligned figure pair, earnings and deductions as compact aligned money rows with a clear Gross → Deductions → Net hierarchy, drift notice as a quiet inline warning. Compensation History moves to `ds-table` density with aligned numeric columns.

**Payslips** — each month becomes a compact period block: period + status chip + net pay dominant, earnings/deductions as two aligned columns, metadata quiet, download action right-aligned. No nested cards.

**Banking** — bank accounts as field grids in a panel instead of cards with icon chips.

**Attendance** — tighter calendar cells, attendance rate presented as a KPI with monthly context, consistent semantic state colors and legend, denser day list.

**Leaves** — leave balances as a compact allocated / used / available grid instead of one colored card per type; requests table on `ds-table` density with restrained status text and a subtle left status accent; actions grouped.

**Requests / Documents / Assets / Policies / Help / My Tasks** — section headers, denser lists/tables, consistent empty states, same actions.

**Settings** — grouped setting rows (label, current value, action on the right) inside titled sections instead of one card per setting; avatar upload, username change and reset password keep exactly today's behavior.

**Empty, loading, error states** — one `ProfileEmptyState` shape everywhere: small icon, one-line title, one-line guidance, existing action only. Skeletons replace centered "Loading…" text.

## Technical notes

- Files: `src/index.css` (additive DS classes only), new `src/components/profile/primitives/*`, `src/pages/UserProfile.tsx`, and the profile components listed above. No hooks, queries, mutations or RPC calls are edited.
- Every existing query key, mutation, dialog, permission gate and route stays byte-identical in behavior; only JSX structure and classes change.
- Work is delivered in passes (foundation + header/nav → Profile/Salary/Payslips/Banking → Attendance/Leaves/Requests → Documents/Assets/Policies/Help/Settings), typechecking after each pass.
- Verification: typecheck plus a Playwright pass over each tab at desktop, laptop and tablet widths to confirm no overflow, no overlap and no console errors.

## Out of scope

Business logic, calculations, payroll/attendance/leave engines, data sources, permissions, HRMS admin pages.
