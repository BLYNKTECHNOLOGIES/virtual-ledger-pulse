# Fix: "Save statutory settings" appears to do nothing

## Root cause (verified)

The click **is** handled — the save is being rejected by validation, but the rejection message is invisible.

- `src/pages/horilla/StatutorySettingsPage.tsx` throws `"A reason is required for every statutory change"` when the Reason field is empty (it is empty in the screenshot) and reports it via `toast.error` imported from **sonner**.
- `src/App.tsx` mounts only the shadcn/Radix `Toaster` (`@/components/ui/toaster`). The **sonner** `<Toaster />` (`src/components/ui/sonner.tsx`) is never mounted anywhere in the app.
- Result: every sonner toast in the app renders nowhere. 111 source files import `toast` from sonner, so this silently swallows both success and error feedback across HRMS, terminal, and ERP screens — not just this dialog.

Database side is healthy and not the cause: `hr_employee_statutory_profiles` has the `hr_esp_unique (hr_employee_id, effective_from)` index the upsert targets, and `authenticated` has full read/write policies.

## The fix

1. **Mount the sonner toaster globally** — import `Toaster as SonnerToaster` from `@/components/ui/sonner` in `src/App.tsx` and render it next to the existing `<Toaster />`. This restores feedback for all 111 files at once.
2. **Make the statutory dialog self-explanatory** — in `StatutorySettingsPage.tsx`:
   - Disable the Save button while Reason is blank, with helper text under the field ("Required — recorded in the statutory change history").
   - Mark the empty Reason field with a destructive border when the user attempts a save.
   - Apply the same treatment to the Bulk update dialog, which has the identical blank-reason failure path.
3. **Verify** with Playwright against the running app: open `/hrms/payroll/statutory-settings`, open an employee's statutory dialog, confirm (a) Save is disabled with no reason, (b) entering a reason and saving shows a visible success toast and the row's effective date updates, (c) confirm the written row in `hr_employee_statutory_profiles` via a DB read.

## Technical notes

- No schema change required.
- Only two files change: `src/App.tsx` (mount) and `src/pages/horilla/StatutorySettingsPage.tsx` (validation affordance).
- The closed-month guard query against `hr_payroll_runs` ignores its own error and is left as-is for this fix.
