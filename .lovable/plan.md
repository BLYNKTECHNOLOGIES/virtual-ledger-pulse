## Root cause (verified, not guessed)

The reason CTC is not landing is **not** a Razorpay data problem — it's that the code that _would_ fetch it isn't the code currently deployed.

Evidence from the database (`hr_razorpay_employee_map`):

- Every row's `last_pulled_at` is **2026-07-17** (yesterday), so pulls _are_ running.
- Every row's `last_pull_snapshot.__salary_probe_error` still reads:

  ```
  HTTP 404 @ salary:salary/view-salary <HTML>
  ```

- That literal string **does not exist anywhere in the current `razorpay-payroll-proxy/index.ts`**. The current source calls `payroll:view-payroll` (verified at lines 143–192 of the function). The only code path that could have written `salary:salary/view-salary` is an older revision.
- Every snapshot has a valid `email` on the Razorpay body (e.g. `shubhamsingh01981@gmail.com`), so email-missing is _not_ the blocker.
- `hr_employee_onboarding.ctc` is populated for only **2 of 40** rows.

Conclusion: yesterday's deep-pulls ran the **previously deployed** version of the proxy that used the old `salary/view-salary` sub-type (which Razorpay 404s). The newer `opfinSalary` implementation that uses `payroll:view-payroll` was authored in the repo but never redeployed, so it has never actually run against Razorpay for these 40 employees.

Secondary constraint (also verified): RazorpayX exposes no read endpoint for the master annual CTC / salary structure. The only readable salary number is `payroll:view-payroll`, which returns a monthly gross **only for months the tenant has already processed payroll for**. If your RazorpayX tenant has never run a payroll month for a given employee, CTC cannot be fetched by API for that employee — it must be entered in HRMS (which is what "Bulk Assign Salary" is for). We won't know which employees fall into that bucket until the new probe actually runs.

## Fix, in order

1. **Redeploy `razorpay-payroll-proxy`** so the current source (with `opfinSalary` → `payroll:view-payroll`) becomes live.
2. **Re-run "Deep Pull"** for all 40 onboarding employees from the RazorpaySyncPage. Each pull will:
   - Call `people:view` (already working).
   - Then walk the last 12 payroll months via `payroll:view-payroll` for that employee's email.
   - On the first month that returns a `salary` field, set `annual_ctc = salary × 12`, write `__salary` onto the snapshot, and the projector fills `hr_employee_onboarding.ctc`.
3. **Read the fresh `__salary_probe_error`** on every map row that still has null CTC. It will now contain one of two clear signatures:
   - `no salary field @ payroll:view-payroll@YYYY-MM keys=…` — the tenant answered, but returned no salary → **no processed payroll on Razorpay for that employee**. CTC has to be entered manually.
   - `NETWORK` / `HTTP 4xx` / `RPERR` — a real error to escalate.
4. **Surface the classification in the UI**: on RazorpaySyncPage, for each employee still missing CTC after the re-pull, show a one-line reason chip:
   - "No payroll processed on Razorpay — enter CTC manually" (green: expected, not an error).
   - "Razorpay error: <short>" (amber: needs retry / attention).

   The Bulk Assign Salary flow already handles the manual case, so no new form is needed — just a clearer "why".

## Technical notes

- File: `supabase/functions/razorpay-payroll-proxy/index.ts`
  - `opfinSalary` at lines 109–193 is the current, correct implementation. No code change needed there.
  - `pull_person_full` at line 1149 already calls `opfinSalary` and writes `__salary` / `__salary_probe_error` onto the snapshot.
  - Projector `projectSnapshotIntoOnboarding` already maps `__salary.annual_ctc → onboarding.ctc` (verified at lines 520–553).
- UI: `src/pages/hrms/RazorpaySyncPage.tsx` already renders a "CTC" tag per row; we'll add the "why-missing" chip driven off `last_pull_snapshot.__salary_probe_error` in the same card.
- No DB migration and no schema change. This is a deploy + re-run + tiny UI hint.

## What you'll see afterwards

- Any employee whose Razorpay tenant has at least one processed payroll month gets CTC filled automatically on the next deep pull.
- Everyone else gets a clear reason chip that says CTC isn't available from the API and directs the HR user to Bulk Assign Salary — instead of silently staying empty.
