
## Goal
Read every toggle in the RazorpayX "Payroll Settings" screen you shared, store the same choices inside HRMS, and route every statutory computation / drift check through those stored values. This keeps HRMS a faithful mirror of RazorpayX — if you flip a switch on Razorpay, you flip the matching switch here and both stay aligned.

## What the screenshot actually toggles (verified line-by-line)

| RazorpayX switch | Your value | Effect we must honor in HRMS |
|---|---|---|
| Salary transfers to employees | ON | Payouts expected via Razorpay |
| Payments to contractors / vendors | ON | Contractor payouts expected via Razorpay |
| Preferred bank transfer method | NEFT | Displayed on payout screens; used in drift copy |
| Upload proof for verification | ON | Bank verification requires uploaded proof |
| Auto-approve if name matches | OFF | Manual verification still needed |
| Salary TDS payments | OFF | HRMS must NOT show "Razorpay files TDS" — you file it |
| Non-salary TDS payments | OFF | Same for contractor TDS |
| PF payments & filing | ON | Razorpay files PF; HRMS drift compares PF |
| ESI payments & filing | ON | Razorpay files ESI; HRMS drift compares ESI |
| Professional Tax filing | ON | Razorpay files PT; HRMS drift compares PT |
| Include employer PF in CTC | ON | CTC in HRMS includes employer PF |
| Include PF EDLI + admin charges in CTC | ON | CTC includes admin/EDLI charges |
| Use only Basic salary for PF | ON | PF wages = Basic only (not Basic+DA) |
| Use ₹15,000 PF wage cap | ON | PF capped at 12% × min(Basic, 15000) |
| Include employer ESI in CTC | ON | CTC includes employer ESI |
| Include additions + one-offs in ESI wages | OFF | ESI wages = regular gross only |

## Deliverables

### 1. Database migration
Extend `hr_razorpay_settings` (already the singleton config row) with typed columns for every switch above, defaulted to your current Razorpay values so the mirror lights up immediately without you re-entering anything.

Columns added (all with sensible defaults matching your screenshot):
- `xpayroll_handles_salary` bool
- `xpayroll_handles_contractors` bool
- `bank_transfer_method` text ("NEFT" / "IMPS" / "RTGS")
- `bank_verification_upload_proof` bool
- `bank_verification_auto_approve_name_match` bool
- `compliance_files_salary_tds` bool
- `compliance_files_nonsalary_tds` bool
- `compliance_files_pf` bool
- `compliance_files_esi` bool
- `compliance_files_pt` bool
- `pf_include_employer_in_ctc` bool
- `pf_include_admin_edli_in_ctc` bool
- `pf_wages_basic_only` bool
- `pf_wage_cap_15000` bool
- `esi_include_employer_in_ctc` bool
- `esi_include_additions_in_wages` bool

### 2. Compute layer alignment
Update `fn_generate_payroll` and the statutory-drift helpers so they read from these columns instead of hardcoded defaults:
- PF base = Basic-only vs Basic+DA driven by `pf_wages_basic_only`
- PF cap logic driven by `pf_wage_cap_15000`
- ESI wage base honors `esi_include_additions_in_wages`
- CTC breakdown expectations honor the four "Include in CTC" toggles when comparing against Razorpay's payload
- TDS drift alerts fire when Razorpay TDS is OFF but a payslip shows TDS (so we never assume Razorpay filed it)

### 3. HRMS Settings UI
New page `Payroll → Compliance Settings` (HR/admin only) that:
- Renders the exact same layout as your Razorpay screen (grouped sections: Payments · Bank Verification · Compliance Payments · PF · ESI)
- Shows each toggle read-only by default with an "Edit mirror" button — because the values must match Razorpay, not diverge from it
- Displays a persistent banner: "These settings mirror your RazorpayX Payroll Settings. Update them here after changing them on RazorpayX so HRMS drift alerts stay accurate."
- Timestamps every change in an audit trail (`updated_at` + `updated_by`)

### 4. Drift surfacing
Wire these mirrored toggles into the existing `hr_drift_alerts` engine so mismatches surface loudly:
- Razorpay payslip has PF amount but `compliance_files_pf = false` → alert
- Razorpay CTC excludes employer PF but `pf_include_employer_in_ctc = true` → alert
- Any similar mismatch across the 16 switches

## Technical details

- Migration is additive only — no destructive changes; defaults are set from your screenshot so existing employees don't need re-processing.
- `fn_generate_payroll` remains gated (RazorpayX is authority). These flags only affect the *expectation* side of drift comparison and the CTC-projection helpers used at onboarding, not the primary payslip numbers (those still come from Razorpay).
- Settings page lives at `/hrms/payroll/compliance-settings` and appears under the existing "Payroll" sidebar group.
- All changes stay HRMS-side. Nothing is pushed to Razorpay — this is a one-way mirror, as the API has no endpoint to update org-level payroll settings anyway (verified against the Razorpay Payroll Postman collection).

## Out of scope (deliberately)
- Two-way sync of these settings to Razorpay — Razorpay has no API for org-level payroll config; dashboard remains the source.
- Any change to how payslips are imported. That flow already reads PF / ESI / PT amounts as-is.

Ready to run the migration and build the mirror UI on approval.
