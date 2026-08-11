# Searchable employee pickers across HRMS

Every place in HRMS where an employee is chosen from a dropdown becomes type-to-search. Scrolling still works — a search box is added on top, filtering by name and badge/PIN as you type.

## Approach

A searchable employee picker already exists (used in the payroll bulk-input and deposit-seeding dialogs). It gets promoted to a shared HRMS component and swapped in everywhere an employee dropdown is rendered today.

Behaviour of the shared picker:
- Trigger looks like the current dropdown (same height, placeholder, dark-theme text).
- Opens a list with a search field focused; typing filters on employee name and badge ID.
- Full scrollable list when the search box is empty.
- "No employee found" empty state.
- Optional inactive-employee badge preserved where the current dropdown shows one.

## Screens to convert

Forms / dialogs:
- Initiate Resignation (Separation page)
- Revise Salary
- New Salary Advance
- Loans — new loan
- Deposit Management
- F&F Settlement
- Penalty Management
- Disciplinary Actions
- Feedback 360
- Asset Assignments
- Employee Documents
- Shift Schedule Manager
- Weekly Off
- Leave Requests (HR-raised request)
- Leave Allocations and Leave Allocation Requests
- Biometric Device Data dialog

Filters (employee filter dropdowns):
- Attendance Overview, Attendance Calendar, Late Come / Early Out, Monthly Hours Summary, Hour Accounts, Payslips, MPI, Helpdesk

A sweep over the remaining HRMS pages catches any employee dropdown not in this list; non-employee dropdowns (shift, leave type, department, status) are left unchanged.

## Technical notes

- Move `src/components/hr/payroll/EmployeeCombobox.tsx` to a shared HRMS location and keep a re-export so existing imports keep working.
- Add an optional `disabled`, `allowClear` (for filters that need "All employees") and `size` prop.
- Each call site keeps its own query/data source; only the rendering of the `Select` changes to `options={[{value, label, keywords: badge_id}]}`.
- No database, RLS, or query changes.
