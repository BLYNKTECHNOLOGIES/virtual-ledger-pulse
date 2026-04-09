

## Add Bank Details to Buyer Onboarding Approval

### Summary
Add a "Bank Details" section to the buyer approval form where the approver enters bank name + last 4 digits (mandatory), optionally uploads a bank statement, and can specify statement period (unlocked only when a statement is uploaded). Multiple bank entries can be added via an "Add More" button. Data persists in a new `client_bank_details` table and displays on the client detail page.

### Database Changes (Migration)

**New table: `client_bank_details`**
- `id` UUID PK
- `client_id` UUID FK → clients(id) ON DELETE CASCADE
- `bank_name` TEXT NOT NULL
- `last_four_digits` TEXT NOT NULL (4 chars)
- `statement_url` TEXT (nullable — path to uploaded file in storage)
- `statement_period_from` DATE (nullable)
- `statement_period_to` DATE (nullable)
- `created_at` TIMESTAMPTZ default now()

RLS: authenticated users full access (matching existing ERP pattern).

Also update the existing `linked_bank_accounts` JSON on the `clients` table during approval (for backward compatibility with `KYCBankInfo` display).

**Storage**: Use existing `kyc-documents` bucket for statement uploads (path: `bank-statements/{client_id}/{filename}`).

### Frontend Changes

#### 1. `ClientOnboardingApprovals.tsx` — Approval Dialog
- Add state: `bankEntries` array of `{ bankName, lastFourDigits, statementFile, statementPeriodFrom, statementPeriodTo }`
- Add a new "Bank Details" section between "Order Information" and "Compliance Form":
  - Each entry row: Bank Name (text input, required), Last 4 Digits (text input, 4 chars, required), Statement Upload (file input, optional), Statement Period From/To (date inputs, enabled only when a file is selected)
  - "+ Add Bank Account" button to append another entry row
  - Remove button (X) on each entry except the first
- Validation in `handleApprove`: at least one bank entry with bank name + last 4 digits filled
- On approval mutation:
  1. Upload any statement files to `kyc-documents` bucket
  2. Insert rows into `client_bank_details` table referencing the client
  3. Update `clients.linked_bank_accounts` JSON array with `{ bankName, lastFourDigits }` entries (merged with any existing)

#### 2. `KYCBankInfo.tsx` — Client Detail Page
- Query `client_bank_details` where `client_id` matches
- Display each bank entry: bank name, last 4 digits, statement download link (if uploaded), statement period
- Keeps existing `linked_bank_accounts` badge display as-is (now populated from approval flow)

### What stays the same
- Seller approval form unchanged
- All other approval fields (phone, state, monthly limit, risk, etc.) unchanged
- Existing KYC document handling unchanged

