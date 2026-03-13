

## Beneficiary Addition Tab for BAMS

### Problem
When Binance P2P purchase orders are received, the seller provides bank details (account number, holder name, IFSC) for payment. These details need to be collected as "beneficiaries" so they can be exported as CSV and added to the company's bank accounts (e.g., HDFC, SBI) for NEFT/IMPS transfers.

### Current State
- `purchase_orders` table already stores `bank_account_number`, `bank_account_name`, and `ifsc_code` from terminal purchase approvals
- However, there's no centralized beneficiary tracking system — no deduplication, no record of which bank accounts a beneficiary has been added to

### Plan

#### 1. New Database Table: `beneficiary_records`

```text
beneficiary_records
├── id (uuid, PK)
├── account_number (text, NOT NULL)          -- seller's bank account number
├── account_holder_name (text)               -- seller's name
├── ifsc_code (text)                         -- seller's IFSC
├── bank_name (text)                         -- seller's bank name (if available)
├── source_order_number (text)               -- first order that introduced this beneficiary
├── client_id (uuid, FK → clients)           -- linked client if known
├── client_name (text)                       -- for display
├── occurrence_count (int, default 1)        -- how many orders had this account
├── first_seen_at (timestamptz)
├── last_seen_at (timestamptz)
├── exported_at (timestamptz)                -- last CSV export timestamp
├── created_at (timestamptz)
├── updated_at (timestamptz)
└── UNIQUE(account_number)                   -- dedup by account number
```

#### 2. New Table: `beneficiary_bank_additions`

Tracks which bank each beneficiary has been added to (many-to-many).

```text
beneficiary_bank_additions
├── id (uuid, PK)
├── beneficiary_id (uuid, FK → beneficiary_records)
├── bank_account_id (uuid, FK → bank_accounts)  -- our company bank
├── added_at (timestamptz)
├── added_by (uuid)
└── UNIQUE(beneficiary_id, bank_account_id)
```

#### 3. Auto-Record Beneficiaries on Purchase Approval

Modify `TerminalPurchaseApprovalDialog.tsx`: after a purchase order is approved, upsert the seller's bank details into `beneficiary_records`. If the account number already exists, increment `occurrence_count` and update `last_seen_at`.

#### 4. New BAMS Tab: `BeneficiaryManagement.tsx`

**Features:**
- **List View**: Paginated table showing all beneficiary records with columns: Account Number, Holder Name, IFSC, Bank Name, Client, Occurrences, First Seen, Banks Added To, Status
- **Search**: Search by account number — shows beneficiary details plus which company banks it's been added to
- **Export CSV**: Select number of entries (e.g., 10, 25, 50) → exports CSV with bank details. After export, prompts to select which active BAMS bank account these beneficiaries were added to → records in `beneficiary_bank_additions`
- **Individual Bank Addition**: Each row has action to mark "Added to Bank" with bank selector (from active BAMS bank accounts)
- **Bank Addition Status**: Visual indicators showing which banks each beneficiary has been registered with

#### 5. BAMS Page Update

Add an 8th tab "Beneficiary" with a `Users` icon to the BAMS tabs (both mobile and desktop layouts).

### Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create `beneficiary_records` and `beneficiary_bank_additions` tables with RLS |
| `src/components/bams/BeneficiaryManagement.tsx` | New — main tab component with list, search, export, bank-addition |
| `src/components/purchase/TerminalPurchaseApprovalDialog.tsx` | Modify — upsert beneficiary on approval |
| `src/pages/BAMS.tsx` | Modify — add Beneficiary tab |

### Data Flow

```text
Binance P2P BUY Order → Terminal Purchase Sync → Approval Dialog
                                                      ↓
                                              beneficiary_records (upsert by account_number)
                                                      ↓
                                              Export CSV (select count)
                                                      ↓
                                              Select bank → beneficiary_bank_additions
```

### Technical Notes
- Deduplication uses `account_number` as unique key — same account across multiple orders only creates one beneficiary record
- Active bank accounts for the "added to" selector come from `useActiveBankAccounts` hook (excludes dormant banks)
- CSV export uses the `xlsx` library already installed
- The `NewPurchaseOrderDialog` (manual purchases) also captures bank details — those will be recorded too

