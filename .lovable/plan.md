

## Add "Source of Income" Block to Buyer Approval Form

### Summary
Add an optional "Source of Income" section to the buyer approval form with four fields: Primary Source of Income (text), Occupation/Business Type (text), Monthly Income Range (number), and Source of Fund Document (file upload). Data persists in a new `client_income_details` table and displays on the client detail page.

### Database Changes (Migration)

**New table: `client_income_details`**
- `id` UUID PK default gen_random_uuid()
- `client_id` UUID FK → clients(id) ON DELETE CASCADE, UNIQUE
- `primary_source_of_income` TEXT (nullable)
- `occupation_business_type` TEXT (nullable)
- `monthly_income_range` NUMERIC (nullable)
- `source_of_fund_url` TEXT (nullable — path in kyc-documents bucket)
- `created_at` TIMESTAMPTZ default now()

RLS: authenticated users full CRUD (matching existing pattern).

**Storage**: Reuse `kyc-documents` bucket (path: `source-of-funds/{client_id}/{filename}`).

### Frontend Changes

#### 1. `ClientOnboardingApprovals.tsx`
- Add state fields: `primarySourceOfIncome`, `occupationBusinessType`, `monthlyIncomeRange`, `sourceOfFundFile` (File | null)
- Add a new "Source of Income" section between Bank Details and Compliance Form — clearly marked as optional (no asterisk)
- Four fields in a 2-column grid:
  - Primary Source of Income (text input)
  - Occupation / Business Type (text input)
  - Monthly Income Range (number input, ₹)
  - Source of Fund Document (file upload)
- No validation required — entire block is optional
- On approval mutation: if any field is filled, upload document (if any) to `kyc-documents` bucket, then insert a row into `client_income_details`

#### 2. `ClientOverviewPanel.tsx` (or `KYCBankInfo.tsx`)
- Query `client_income_details` where `client_id` matches
- Display the income details (source of income, occupation, monthly income, document download link) in the client detail view

### What stays the same
- Bank details section unchanged
- Compliance form unchanged
- Seller approval unchanged
- All validation for mandatory fields unchanged

