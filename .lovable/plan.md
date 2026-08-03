# Payslip ZIP ingestion for Step 7 (RazorpayX monthly export)

## Short answer: yes — reliably, not by guessing

I extracted your June archive and checked it against the HRMS. The structure is
fully deterministic, and it carries the RazorpayX employee code in three
independent places, so matching does not depend on name fuzziness at all.

```text
06-2026-Payslips-<ts>.zip
├── Active Employees/
│   └── 70 - Shubham Singh/
│       └── Shubham Singh-70-Jun 2026-Payslip.pdf
└── Dismissed Employees/
    └── 87 - Neha Patel/
        └── Neha Patel-87-Jun 2026-Payslip.pdf
```

Three code signals per file: the folder prefix (`70 - `), the filename segment
(`...-70-Jun 2026-...`), and inside the PDF text itself (`Employee Code 70`).
The period is also in the filename (`Jun 2026`).

## What the archive actually contained

- 38 payslip PDFs — 31 under "Active Employees", 7 under "Dismissed Employees".
- Employee codes present: 1,2,3,4,5,8,10,14,15,17,18,19,20,22,23,26,28,29,35,36,
  38,39,40,41,42,43,44,45,46,47,48,49,52,54,69,70,71,87.
- 35 of 38 codes resolve to an HRMS employee through the existing RazorpayX
  employee map, and every resolved name matches the folder name exactly.
- 3 codes have no HRMS record at all: **19 Ameer UL Hasan, 36 Gargi Yadav,
  87 Neha Patel** (all under "Dismissed Employees"). These cannot be matched and
  will be reported as unmatched, never guessed.
- Two mapped people (42 Sneha Shukla, 46 Rashi Mandrai) are inactive in HRMS but
  have a June payslip — they'll be listed as "inactive, needs your decision"
  rather than silently included or dropped.

## What I'll build

**One ZIP drop replaces the manual per-file upload** in the Step 7 dispatch
panel. You upload the archive exactly as RazorpayX gives it to you; nothing is
renamed on your side.

1. **Parse in the browser.** Unzip client-side, walk every `*.pdf`, and derive
   `{ employee_code, period, folder_group }` from the path.
2. **Three-way code agreement.** Folder code, filename code, and the code read
   out of the PDF text must agree. If any disagree, the file is quarantined as
   a conflict and is not attached to anybody.
3. **Period guard.** If the filename period (e.g. `Jun 2026`) doesn't match the
   cockpit month you're standing on, the whole import is blocked with a clear
   message — no cross-month mis-sends.
4. **Resolve by code only.** Employee code → RazorpayX employee map → HRMS
   employee. Name is used only as a confirmation display, never as the matcher.
5. **Upload + link.** Each matched PDF goes to the private `payslips` bucket
   under a deterministic month/employee path and is linked to that employee's
   payslip record for the month. Re-importing the same archive overwrites the
   same paths (idempotent, no duplicates).
6. **Import report** before anything is sent: matched count, unmatched codes,
   conflicts, inactive/dismissed, duplicates, and any HRMS employee for the
   month who has no PDF in the archive. Sending stays blocked for anyone
   without a linked PDF.

Dismissed-folder payslips are imported and linked (so they exist on record) but
are excluded from the send list by default, with an explicit opt-in per person.

## Technical notes

- Client-side unzip via a zip library in `PayslipEmailDispatchPanel.tsx`;
  no server-side archive handling needed.
- Code extraction from PDF text uses a lightweight text layer read; if a PDF has
  no text layer, the file falls back to two-signal agreement (folder + filename)
  and is flagged as "code not verified inside PDF".
- Storage path: `payslips/<YYYY-MM>/<hr_employee_id>.pdf` — deterministic, so
  re-imports replace rather than accumulate.
- Matching table: `hr_razorpay_employee_map.razorpay_employee_id` (text) is the
  single join key; unmapped codes surface as an actionable list rather than an
  error.
- The existing per-file manual attach stays available for one-off fixes.
