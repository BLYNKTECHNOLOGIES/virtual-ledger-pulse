

## Root Cause

The badge "🪪 Same KYC name — SHARAD KUMAR JAISWAL" is appearing on MIKHII THEODORE DIAS's pending row because the database table `client_verified_names` has been **polluted with cross-contaminated entries** for one client.

### What I found in the DB

Client `1ee750ac…` (real name "SHARAD KUMAR JAISWAL", buyer APPROVED) has **6 different KYC verified names** attached to it:

```
SHARAD KUMAR JAISWAL   (own — correct)
MIKHII THEODORE DIAS   ← causing this bug
RAHUL BAWEJA
MOHAMMAD JISHAN
Rahul Singh
SHAIF AHMED JAGIRDAR
```

All 6 rows have `source = 'approval'`. So when MIKHII's pending row is evaluated, the lookup `verifiedNameToClient.get("MIKHII THEODORE DIAS")` returns SHARAD's client record → tag fires.

This is the SAME class of cross-contamination we have seen earlier with nickname links — but on the verified-name side.

### Why it happened (code paths that polluted the table)

The "merge into existing client" approval flows blindly upsert the **incoming Binance verified name** onto the **chosen target client**, with no sanity check that the name actually belongs to that person:

1. `TerminalSalesApprovalDialog.tsx` lines 727-741
2. `TerminalPurchaseApprovalDialog.tsx` lines 531-545
3. `ClientOnboardingApprovals.tsx` lines 839-849 — even worse: falls back to `approval.client_name` when verified_name is missing.

So whenever an operator approved an order/onboarding and clicked "Merge into existing client = SHARAD KUMAR JAISWAL" while the Binance counterparty was actually MIKHII / RAHUL / etc., the wrong KYC name got attached to SHARAD. Six wrong merges over time = 6 rogue verified names.

The same risk exists for `client_binance_nicknames` (single nickname uniquely owned globally — but cross-attachment via merge still possible).

---

## Fix Plan

### 1. Data cleanup migration (one-time)

Delete cross-contaminated `client_verified_names` rows: for each client, keep only verified names that match the client's actual `clients.name` (case-insensitive) **OR** appear in at least one of that client's Binance orders' `verified_name` field. Anything else is a misattribution from a past wrong merge — delete.

Apply the same audit to `client_binance_nicknames`: a nickname linked to client X is suspect if no order with that counterparty nickname has client X as the matched/approved party.

For SHARAD's record specifically, this will remove the 5 foreign verified names and keep only "SHARAD KUMAR JAISWAL".

### 2. Guard against future cross-contamination

**A. Approval-time correlation check** (in all 3 approval paths above): before upserting a verified name onto a target client, require ONE of:
- `target client's name` matches `verified_name` (case-insensitive), OR
- the same `verified_name` already exists on `client_verified_names` for that client, OR
- the unmasked nickname being linked already belongs to that client in `client_binance_nicknames`.

If none match → still create the order linkage, but **do NOT auto-upsert the verified name**. Log a warning. The operator can attach it manually later if intended.

**B. DB-level safety trigger** `trg_validate_verified_name_attachment` on `client_verified_names` BEFORE INSERT/UPDATE: blocks attachment when the verified name has zero similarity to either the client's stored name or any prior verified name on that client AND no supporting nickname link exists. Emits a clear error so the UI can surface it.

**C. Same nickname-side trigger** (already partially mitigated by `unique(nickname)` but not by ownership): block re-pointing an existing nickname to a different client unless the operator explicitly invokes a "transfer nickname" admin action.

### 3. UI surface — Approvals queue

Once cleanup runs, the "MIKHII THEODORE DIAS" row will correctly drop to "New Client" tag. No UI code change needed in the approvals component — the bug was purely data-side.

---

## Files to change

- **New migration**: `supabase/migrations/<ts>_verified_name_cleanup_and_guards.sql`
  - DELETE cross-contaminated rows in `client_verified_names`
  - DELETE cross-contaminated rows in `client_binance_nicknames`
  - CREATE FUNCTION + BEFORE-INSERT/UPDATE trigger on `client_verified_names`
  - CREATE FUNCTION + BEFORE-UPDATE trigger on `client_binance_nicknames` (block client_id reassignment without admin override flag)
- `src/components/sales/TerminalSalesApprovalDialog.tsx` — add correlation check before verified-name upsert
- `src/components/purchase/TerminalPurchaseApprovalDialog.tsx` — same
- `src/components/clients/ClientOnboardingApprovals.tsx` — same, plus remove the `|| approval.client_name` fallback that conflates display name with KYC name

---

## What you'll see after the fix

- The MIKHII THEODORE DIAS pending buyer row → tag becomes **"New Client"** (or accurate match if MIKHII actually exists elsewhere).
- SHARAD KUMAR JAISWAL's record stays clean with only his own KYC name.
- Any future wrong "merge into existing client" click cannot pollute the KYC table again — the DB trigger will reject it and the UI will get a clear toast.

Reply **approved** to execute cleanup + guards.

