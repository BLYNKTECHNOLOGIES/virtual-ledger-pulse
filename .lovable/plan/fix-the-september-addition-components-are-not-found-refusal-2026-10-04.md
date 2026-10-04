# Fix the September "addition components are not found" refusal

## What the records show

- Sabeel's ₹233 test (pushed 05:29 IST today) went out under the exact name **Correction**, with only the name and amount, which is the shape in RazorpayX's official instructions. RazorpayX refused it three ways: by employee ID, by employee ID without description, and by email.
- So the name list from the Edit Salary dropdown is **not** what RazorpayX checks. The dropdown also lists one-off names left over from earlier months.
- In August the same push worked. RazorpayX's records show August's "Correction" as a different kind of line (type 4, non-taxable) from our pushed lines (type 0).
- RazorpayX now has a **Salary Component Library** (Settings → Salary Component Library). Each earning there has a fixed *Component name* and a separate *Display name*. The most likely cause: since September, RazorpayX only accepts additions whose name matches a **Component name in that library**, not a name from the Edit Salary dropdown.

This is the strongest explanation, but it is **not yet confirmed**. Step 1 confirms it.

## Step 1 — You check RazorpayX (about 5 minutes)

1. Open RazorpayX → Settings → **Salary Component Library**.
2. Send screenshots of every **Earning** component, showing both its *Component name* and *Display name*.
3. Try **Create component → Earning** with name `Comp-off encashment` (taxable). Tell me if it saves. This tests whether the "can't create new names" bug also affects the library or only the Edit Salary screen.

Don't push anything else until this is done.

## Step 2 — I rebuild the approved-name list from the library

- Replace the current 26 addition names with the exact library *Component names*, keeping spelling and capitals.
- Re-map all 46 waiting September lines, for example comp-off goes to the library's comp-off or overtime component, and the training salary difference goes to an arrears or ad-hoc component. You confirm any line that has no clear match.
- The name picker in Step 6 then shows only library components.

## Step 3 — One test push, then the rest

- Push Sabeel's ₹233 once under a library name. If RazorpayX reads it back on his run, push the remaining September lines.
- If even a library name is refused, the problem is on RazorpayX's side. I'll prepare a short note for their support with the exact request, the response and timestamps, and September waits for their fix (or goes in by hand on the dashboard).

## Also fixed in this round

- Replace the raw `{"message":...,"code":0}` pop-up with a plain message: "RazorpayX did not recognise the name '<name>'. It must match a Component name in Settings → Salary Component Library."
- Stop the three automatic retries for this error, since they can't succeed and only create noise in the records.

## Technical details

- Evidence: in `hr_razorpay_sync_log`, rows at 2026-10-03 23:24 and 23:59 UTC show `sent: [{label:"Correction", amount:233}]` and the retries `email_label_amount`, `employee_id_label_amount` and `employee_id_no_remarks` all returning code 0. August's `push_response` shows `Correction` with `type: 4`.
- Catalogue update: new rows in `hr_razorpay_component_catalog` (kind `addition`, `label` = library Component name). Old dropdown-only names are deactivated, not deleted, so August's audit trail stays intact. A backfill re-resolves `razorpay_label` on unpushed rows only.
- Proxy (`razorpay-payroll-proxy`): remove the simplified-retry loop for `components not found`, return code `RZP_COMPONENT_NOT_IN_LIBRARY` with the offending name, and keep the failure snapshot.
- `AGENTS.md`: change the existing RazorpayX additions rule so it names the Component Library as the source of approved names.
