# Remove the Regulatory module from Compliance

The Regulatory tab (NCRP / Cyber Cell register, STR Register, Statutory Calendar) is retired. Bank cases and Legal Actions already carry this work. All three registers are empty today (0 rows), so nothing is lost.

## UI changes

- Remove the "Regulatory" primary tab and its content from the Compliance page; remaining tabs: Overview, Banking, Legal, Company, Governance.
- Delete `RegulatoryComplianceTab`, `RegulatoryCasesTab`, `StrRegisterTab`, `StatutoryCalendarTab`.
- Legal Actions: escalation linkage keeps working for bank cases only. The "Escalate to legal" dialog drops its regulatory-case branch; the source-case badge and linked/standalone filter stay, resolving bank cases only.

## Statistics adjustments

The Compliance Overview command centre currently shows three regulatory KPIs and one list:

- "Regulatory open" and "Regulatory due 7d" KPIs — removed.
- "STR decisions pending" KPI — removed.
- "Statutory obligations due in 30 days" list — removed.

The `compliance_command_centre()` function is rewritten to stop reading the dropped tables and to stop returning those keys; the Overview grid re-flows to the remaining KPIs (open cases, funds under lien, hearings, expiring documents, idle cases).

## Database cleanup

A migration will:

- Drop `compliance_regulatory_cases`, `compliance_str_register`, `compliance_statutory_obligations` (with their policies, triggers and indexes).
- Drop `legal_actions.regulatory_case_id` and its index (the bank-case link stays).
- Delete reminder-log rows pointing at the dropped entity types.
- Replace `compliance_command_centre()` with a version free of regulatory references.

## Reminder job

`compliance-reminders` stops scanning regulatory response deadlines and statutory filings; it keeps bank-case and document-expiry reminders.

## Technical notes

- Files touched: `src/pages/Compliance.tsx`, `src/components/compliance/ComplianceCommandCentre.tsx`, `EscalateToLegalDialog.tsx`, `LegalActionsTab.tsx`, deletion of the four regulatory components, `supabase/functions/compliance-reminders/index.ts`.
- Verification after the change: run the Compliance page in the preview for console errors, and confirm `compliance_command_centre()` returns a clean payload from the database.
