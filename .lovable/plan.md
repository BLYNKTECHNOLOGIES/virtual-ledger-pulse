# Compliance Management — current state, gaps, and proposed roadmap

## What exists today (verified)

The Compliance page is gated by `compliance_view` and has three tabs.

**Banking** (5 sub-tabs)
- Cases — lists `bank_cases` joined to bank accounts. Case types: Account Not Working, Wrong Payment Initiated, Payment Not Credited, Settlement Not Received, Lien Received, Balance Discrepancy. "Report New Case" does not open a form; it shows a dialog telling you to create the case in BAMS. Actions: Start Investigation, View Timeline.
- Active Investigations — cases with `investigation_status = UNDER_INVESTIGATION`, grouped High/Medium/Low. Opens the investigation dialog.
- Investigation dialog — auto-creates an `account_investigations` row and seeds 5 fixed steps (Initial Assessment, Bank Communication, Documentation Review, Corrective Actions, Verification). Steps must be completed in order, each with mandatory notes and an optional file. Updates with attachments go to the `investigation-documents` bucket. "Submit for Approval" requires all 5 steps done, a final resolution text and at least one file; it writes an `investigation_approvals` row with status PENDING.
- Past Cases — resolved investigations, with per-investigation PDF report generation (the only export in the module).
- Communications — bank name, contact person, mode (Email/Call/Letter/Meeting), date, notes.
- Credentials — per-bank-account login/transaction/profile passwords, UPI PIN, security questions. Stored unencrypted in columns; restricted at DB level to managers, delete to super admin.

**Legal** (3 sub-tabs) — Document Management (name, category, expiry, file), Legal Actions (litigation/arbitration/dispute with court, case no., lawyers, hearing date, estimated vs actual cost), Legal Communications (party, subject, content, attachments, follow-up flag/date, optional link to a legal action).

**Company** — subsidiaries/firms registry (composition, GST, PAN, CIN, address, contacts). The Add Firm button is the only create action in the module with no `compliance_manage` check.

## Confirmed problems

1. **The approval step is a dead end.** `PendingApprovalsTab` (a complete approve/reject screen) is not mounted anywhere. Once a case is submitted for approval nothing in the live UI can approve or reject it. `investigation_approvals` currently has 0 rows.
2. **Three more finished screens are unmounted**: `AccountStatusTab` (bank-account-centric status board), `LienCaseTrackingTab` (+ `AddLienUpdateDialog`) and `TaxationComplianceTab`.
3. **Timeline shows nothing.** `ViewTimelineDialog` queries `lien_updates` using a `bank_cases.id`, which can never match. Both lien tables are empty (0 rows) because the only screen that writes them is unmounted.
4. **Status vocabulary drift** between `bank_cases.status`, `bank_cases.investigation_status` and `account_investigations.status` (RESOLVED vs COMPLETED vs ACTIVE used differently), so the two rows representing one real case can diverge.
5. **Document expiry is cosmetic.** `compliance_documents.status` badges ACTIVE/EXPIRED/EXPIRING_SOON but nothing ever computes it from `expiry_date`. No reminders anywhere: hearing dates, follow-up dates, expiry dates all sit inert.
6. **No data-layer security.** `bank_cases`, `account_investigations`, `investigation_approvals`, `legal_actions`, `compliance_documents`, `lien_cases`, `subsidiaries` all have `USING (true)` policies for any authenticated user. Only `banking_credentials` is properly restricted.
7. **Siloed from the rest of the ERP.** No compliance table links to `clients`, `bank_transactions`, sales/purchase orders, KYC docs or risk levels. A frozen account cannot be traced to the orders or clients that funded it.
8. **No dashboard, no aggregate, no CSV.** Every tab is a flat filtered list.
9. **Effectively unused**: 2 bank cases, 4 subsidiaries, 0 rows in legal actions, communications, documents, credentials, liens.

## Proposed roadmap

### Phase 1 — Make the existing workflow actually complete
- Mount **Pending Approvals** as a Banking sub-tab with a live count badge; restrict approve/reject to a new `compliance_approve` permission (maker-checker: the submitter cannot approve their own investigation).
- Mount **Lien Cases** as a Banking sub-tab and fix `ViewTimelineDialog` to read the correct timeline source (case updates for bank cases, lien updates for lien cases) instead of the mismatched join.
- Mount **Account Status** as the Banking landing view so the entry point is the bank account, not an abstract case.
- Collapse the status vocabulary into one canonical set and add a DB trigger keeping `bank_cases` and `account_investigations` in sync so they cannot drift.
- Add the missing `compliance_manage` gate on Add Firm.
- Tighten RLS on all compliance tables to permission-checked policies instead of `USING (true)`.

### Phase 2 — Reporting and alerting (the biggest gap for the business)
- **Compliance Command Centre** as the default landing view: open cases by type and age bucket, funds under lien (₹ total, count of accounts), accounts frozen/non-operational right now, average days to resolve by bank, hearings in next 30 days, documents expiring in 60 days, approvals waiting.
- **Ageing and SLA**: days-open on every case, a per-bank SLA, and red/amber ageing chips — the single most useful field for a P2P business where a frozen account is idle working capital.
- **Reminder engine** (scheduled edge function + `hr@`-style branded mail): document expiry T-60/T-30/T-7, hearing date T-7/T-1, legal follow-up date due, case idle for N days with no update, approval pending > 48h. Reuse the existing SMTP relay pattern.
- Nightly job that recomputes `compliance_documents.status` from `expiry_date`.
- CSV export on every list, plus a **Regulator Response Pack**: one PDF/zip per case bundling the case record, full timeline, all attachments, the linked bank statement window and the linked client KYC.

### Phase 3 — Link compliance to the business (data model)
- Add `client_id` and an order-reference array to `bank_cases`/`lien_cases`, with a resolver that suggests the client from the disputed UTR/amount/date against `bank_transactions` and sales orders.
- Show a **Compliance** strip on the client profile: open cases, liens, past freezes; and auto-escalate that client's risk level while a case is open (writing back to the existing risk taxonomy, not a parallel one).
- Show a **Compliance** badge on the bank account in BAMS: lien amount, frozen flag, and block/warn on payouts from an account with an active freeze.
- Amount-at-stake on every case, so lien exposure rolls into the Management Balance Sheet as a restricted-cash line.

### Phase 4 — India-specific regulatory layer
- **Cyber-cell / NCRP register**: acknowledgment number, portal, complaint date, LEA name, jurisdiction, deadline to respond, response filed date and proof — today these are squeezed into free-text notes.
- **Debit-freeze vs full-freeze** distinction with the exact lien amount and release date, since partial liens still allow operations.
- **STR/SAR internal register** with a maker-checker decision trail (file / not file / rationale), and a **Travel Rule / counterparty due-diligence** log for large P2P counterparties.
- Per-entity view: every register filterable by subsidiary, because obligations are per-firm (GST/PAN/CIN already captured).
- Statutory calendar per subsidiary (GST, TDS returns, ROC, ITR) with owner and status — turning Company Compliance from a static registry into a live obligation tracker.

### Phase 5 — Workflow quality
- Case-type-specific investigation templates instead of the same 5 steps for every case (a lien case and a balance discrepancy need different evidence).
- Move all hardcoded dropdowns (case types, categories, action types, communication modes, credential types, states, firm compositions) into config tables so ops can extend them without a code change.
- Assignment and ownership: assignee, watchers, and an in-app + email nudge on assignment, consistent with the existing task/nudge system.
- Immutable audit trail on every compliance mutation (who, what, before/after) — this is what a bank or regulator actually asks for.
- Encrypt banking credentials at rest with server-side decryption on demand and an access log, rather than plaintext columns with a copy button.

## Technical notes
- New scheduled work runs as edge functions on `pg_cron`, following the existing HR notifier pattern; email via the existing branded SMTP relay.
- RLS tightening uses the existing permission helpers rather than new role checks; a new `compliance_approve` permission is added to the permission catalogue and Rules & Permissions UI.
- Status unification requires a data migration over the 2 existing `bank_cases` rows plus a sync trigger — low risk given current volume.
- Client/order linkage adds nullable FK columns; no backfill is forced, the resolver suggests matches for existing rows.

## Suggested sequencing
Phase 1 first (it is small and the module is currently unusable end to end), then Phase 2, since reporting and reminders give the most operational value. Phases 3–5 can be taken one slice at a time.
