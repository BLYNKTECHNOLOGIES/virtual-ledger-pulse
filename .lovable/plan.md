# Remove KYC Approvals + Video KYC

Both pages share the same two tables (`kyc_approval_requests`, `kyc_queries`) and form one pipeline (KYC Approvals hands status `VIDEO_KYC` to the Video KYC page). Per your answers, both pages go, the two tables are dropped (purging their rows), and the client-directory KYC submission view is removed. **All `sales_orders`, `wallets`, `sales_payment_methods`, and `bank_accounts` records previously created by this flow are left fully intact** — only the KYC request/query data is removed.

## Frontend removals

**Delete pages & route**
- Delete `src/pages/KYCApprovals.tsx` and `src/pages/VideoKYC.tsx`.
- In `src/App.tsx`: remove the `KYCApprovals` and `VideoKYC` imports and the `/kyc-approvals` and `/video-kyc` route entries.

**Delete exclusive component folders/files**
- `src/components/hrms/kyc-approvals/` (entire folder: PendingKYCTab, QueriesTab, RejectedKYCTab, AcceptedKYCTab, CreateKYCRequestDialog, CreateQueryDialog, ResolveQueryDialog, OrderCompletionDialog, KYCDetailsDialog, KYCTimelineDialog, PaymentMethodSelectionDialog, UserPayingOptionsDialog).
- `src/components/hrms/KYCApprovalsTab.tsx`.
- `src/components/hrms/video-kyc/` (entire folder: NewVideoKYCTab, CompletedVideoKYCTab, VideoKYCSessionDialog).
- `src/components/hrms/VideoKYCTab.tsx`.

**Navigation**
- `src/components/AppSidebar.tsx`: remove the `kyc-approvals` and `video-kyc` menu items (and now-unused `Video` icon import if unreferenced).
- `src/components/MobileBottomNav.tsx`: remove the "KYC Approvals" and "Video KYC" entries.

**Permissions UI**
- `src/components/user-management/EditRoleDialog.tsx` and `AddRoleDialog.tsx`: remove the `'n'` (KYC Approvals) and `video_kyc_view`/`video_kyc_manage` permission rows.
- `src/pages/UserManagement.tsx`: remove the `view_kyc_approvals`/`'n'` and video_kyc permission mappings.
- The underlying `app_permission` enum values are left in place (Postgres enum values can't be safely dropped and are harmless once unused).

## Client directory cleanup
- `src/components/clients/ClientOverviewPanel.tsx`: remove the `kycData` query against `kyc_approval_requests` and any UI that renders it; remove the `KYCDocumentsDialog` usage tied to the KYC submission view.
- `src/components/clients/KYCDocumentsDialog.tsx`: remove the "Latest KYC Submission (from kyc_approval_requests)" section and its query. If the dialog also surfaces `client_kyc_documents`, that part stays; if the dialog becomes entirely about the removed submission, delete the file and its import.

## Edge function cleanup
- `supabase/functions/risk-detection/index.ts`: remove the `FREQUENT_APPEALS` rule (its only logic queries `kyc_queries`). All other risk rules are untouched, so scoring continues without that one signal.

## Database migration
After all code references are gone:
- `DROP TABLE public.kyc_queries;` (has FK to kyc_approval_requests — dropped first).
- `DROP TABLE public.kyc_approval_requests;`

This purges all KYC request/query rows. `sales_orders`, `wallets`, `sales_payment_methods`, and `bank_accounts` have no FK into these tables, so they are unaffected. No daily-report metrics change — those read `client_onboarding_approvals`, a separate table.

## Verification
- Typecheck/build to confirm no dangling imports.
- Grep the repo for `kyc_approval_requests`, `kyc_queries`, `KYCApprovalsTab`, `VideoKYCTab`, `/kyc-approvals`, `/video-kyc` to confirm zero remaining references before running the drop migration.
- Confirm Client directory, risk-detection, and the daily report still build and run.

## Out of scope / preserved
- `client_onboarding_approvals` (buyer-side daily-report ledger) — untouched.
- `client_kyc_documents` and the rest of the Client directory — untouched.
- All financial records (sales orders, wallets, bank accounts) created by the old flow — untouched.
