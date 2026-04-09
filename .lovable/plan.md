

## Revamp KYC Documents Section in Buyer Approval Form

### Summary
Replace the current minimal document handling in the buyer approval form with a structured KYC Documents section containing four document categories: Aadhaar Card (mandatory, multi-file), USDT Usage Proof (optional), Trade History Screenshot (optional), and vKYC Video (optional, compressed). All documents are stored in client-specific folders in `kyc-documents` bucket and displayed/downloadable from the client overview page.

### Database Changes

**New table: `client_kyc_documents`**
- `id` UUID PK
- `client_id` UUID FK → clients(id) ON DELETE CASCADE
- `document_type` TEXT NOT NULL — one of: `aadhaar`, `usdt_usage_proof`, `trade_history_screenshot`, `vkyc_video`
- `file_url` TEXT NOT NULL
- `file_name` TEXT NOT NULL
- `file_size` BIGINT (nullable)
- `mime_type` TEXT (nullable)
- `created_at` TIMESTAMPTZ default now()

RLS: authenticated users full CRUD.

This replaces the old pattern of storing `aadhar_front_url`/`aadhar_back_url` on the clients table for new approvals. Existing data remains untouched.

### Storage Structure
All files stored in `kyc-documents` bucket with path: `{client_id}/aadhaar/`, `{client_id}/usdt-proof/`, `{client_id}/trade-history/`, `{client_id}/vkyc/`.

### Frontend Changes

#### 1. `ClientOnboardingApprovals.tsx` — New "KYC Documents" Section

Add between "Source of Income" and "Compliance Form" (before the monthly limit fields):

**State variables:**
- `aadhaarFiles: File[]` (multi-file, mandatory — at least 1 required)
- `usdtProofFile: File | null` (optional)
- `tradeHistoryFile: File | null` (optional)
- `vkycVideoFile: File | null` (optional)

**UI Layout (4 rows):**
1. **Aadhaar Card \*** — multi-file upload (accepts image/\*, .pdf, any). Shows all selected files with remove buttons. "Add More" button to append. Validation: at least 1 file required.
2. **USDT Usage Proof** (Optional) — single file upload, accepts image/\*, .pdf.
3. **Trade History Screenshot** (Optional) — single file upload, accepts image/\*, .pdf.
4. **vKYC Video** (Optional) — single file upload, accepts video/\*. Label notes compression will be applied.

**On approval mutation:**
1. Determine target `client_id` (same logic as bank details).
2. Upload each file to `kyc-documents` bucket under `{client_id}/{category}/` path.
3. For vKYC video: upload as-is (client-side compression not feasible, but use a reasonable file size note in the UI). The file is stored directly.
4. Insert rows into `client_kyc_documents` for each uploaded file.
5. Also update `aadhar_front_url` on the clients table with the first Aadhaar file URL for backward compatibility.

**Validation:** Block approval if no Aadhaar file is selected.

#### 2. `KYCBankInfo.tsx` — Display Documents in Client Overview

- Query `client_kyc_documents` where `client_id` matches, grouped by `document_type`.
- Replace the current static PAN/Aadhaar/Other Docs display with a dynamic section showing all document categories.
- Each document shows: file name, type badge, view/download button.
- vKYC video entries get a play/download button.
- Keep existing PAN Card and legacy Aadhaar URL display as fallback for older clients.

### What stays the same
- Bank Details section unchanged
- Source of Income section unchanged
- Seller approval form unchanged
- PAN card field on clients table stays (used by older onboarding flow)
- All existing validation for mandatory fields unchanged

### Technical Notes
- Video files: stored as-is in Supabase storage. A UI hint will suggest keeping videos under 50MB. Server-side compression is not implemented (would require an edge function with ffmpeg which is out of scope). The bucket already has public access per project security policy.
- Multi-file Aadhaar: uses a standard `<input type="file" multiple>` with a list display and individual remove buttons.

