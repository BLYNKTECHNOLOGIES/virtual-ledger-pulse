

# ERP Full System Audit — Phase 13 Report

## Phases 1-12 Status (completed)
- Phase 1-4: Data integrity, orphaned code, permissions, demo-admin cleanup — ALL FIXED
- Phase 5: Hardcoded password, dead localStorage, native dialogs replaced — ALL FIXED
- Phase 6: XSS fix, stale removeItems, shift delete cleanup — ALL FIXED
- Phase 6.5: Buy Orders/Pending/Review tabs removed, 25 files deleted, dead DB columns + trigger dropped — ALL FIXED
- Phase 7: 3 dead DB tables dropped, dead `useIsOrderFocused` removed, `window.location.reload()` replaced in EditUserDialog — ALL FIXED
- Phase 8: 2 orphaned HRMS files deleted, OrderFocusContext fully removed, empty import + stale localStorage + duplicate session writes cleaned — ALL FIXED
- Phase 9: 5 orphaned hooks + 2 orphaned utils deleted (~494 lines) — ALL FIXED
- Phase 10: 4 dead auth components + TopNav + payslipPdfGenerator deleted (~1,424 lines), AuthProvider cleaned — ALL FIXED
- Phase 11: Orphaned HorillaModulePage deleted, 138 console.log calls removed from 5 worst-offender files — ALL FIXED
- Phase 12: 91 console.log calls removed from 12 files (batch 2) — ALL FIXED

---

## CATEGORY 1: CONSOLE.LOG CLEANUP — BATCH 3 (Remaining significant offenders)

~672 console.log calls remain across 39 files. This phase targets the next tier of files with meaningful debug noise. Files in `src/hooks/`, `src/components/sales/`, `src/components/purchase/`, `src/components/stock/`, `src/components/terminal/`, and `src/utils/`.

### P13-LOG-01 | StepBySalesFlow.tsx — ~10 console.log calls

Order creation traces, wallet deduction logs, platform fee processing, client onboarding detection, and final submit dumps. Remove all.

### P13-LOG-02 | QuickSalesOrderDialog.tsx — ~6 console.log calls

Order creation, client lookup, and onboarding approval traces. Remove all.

### P13-LOG-03 | TerminalSalesApprovalDialog.tsx — ~3 console.log calls

Partial approval recovery, bank transaction, and client profile update traces. Remove all.

### P13-LOG-04 | SalesEntryDialog.tsx — 2 remaining console.log calls

Form submit event and button click traces that survived Phase 12. Remove both.

### P13-LOG-05 | ManualPurchaseEntryDialog.tsx — 1 remaining console.log call

Wallet selection trace that survived Phase 12. Remove it.

### P13-LOG-06 | TerminalPurchaseApprovalDialog.tsx — ~3 console.log calls

Client profile update and WAC position update traces. Remove all.

### P13-LOG-07 | StockTransactionsTab.tsx — ~7 remaining console.log calls

Transfer fee, manual adjustment, and entry count debug dumps. Remove all.

### P13-LOG-08 | WalletLinkingSection.tsx — 1 console.log call

Wallet link success trace. Remove it.

### P13-LOG-09 | usePayerModule.ts — ~7 console.log calls

Order matching, lock assignment, and pending order debug traces. Remove all.

### P13-LOG-10 | useBinanceActions.tsx — ~2 console.log calls

Order history phase 1/2 loading traces. Remove both.

### P13-LOG-11 | useSellerPaymentCapture.ts — ~5 console.log calls

Payment capture flow traces (order counts, captured details, beneficiary saves). Remove all.

### P13-LOG-12 | useTerminalPurchaseSync.ts — ~3 console.log calls

Purchase sync cutoff, completed/appeal counts, and live status traces. Remove all.

### P13-LOG-13 | useSmallBuysSync.ts — ~7 console.log calls

Sync disabled, no orders, duplicates, new orders, mapping, and batch summary traces. Remove all.

### P13-LOG-14 | useBinanceOrderSync.tsx — ~2 console.log calls

Window/page sync counts and full sync trigger traces. Remove both.

### P13-LOG-15 | useSpotTradeSync.ts — ~2 console.log calls

No new trades and synced count traces. Remove both.

### P13-LOG-16 | useErpActionQueue.ts — 1 console.log call

syncAssetMovements result trace. Remove it.

### P13-LOG-17 | Terminal components — ~15 console.log calls

- `BiometricManagementDialog.tsx` — 2 calls (edge function invoke traces)
- `TerminalRolesList.tsx` — 1 call (RPC params JSON dump — security risk)
- `ChatImageUpload.tsx` — ~8 calls (pre-signed URL, upload steps, chat message results)
- `OrderDetailWorkspace.tsx` — 1 call (payment signal debug)

### P13-LOG-18 | Utils — ~7 console.log calls

- `invoicePdfGenerator.ts` — 1 call (PDF generation start)
- `updateClientFromOrder.ts` — 1 call (client update success)
- `clientIdGenerator.ts` — ~5 calls (phone match, race condition traces)

### P13-LOG-19 | LoginPage.tsx — 1 console.log call

User authentication success trace — logs user object to console. Security concern. Remove it.

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Debug console.log (batch 3) | ~27 files, ~85 calls | MEDIUM — production noise + security risks |

### Implementation Plan

| # | Bug ID | Files | Count |
|---|--------|-------|-------|
| 1 | P13-LOG-01 | StepBySalesFlow.tsx | ~10 |
| 2 | P13-LOG-02 | QuickSalesOrderDialog.tsx | ~6 |
| 3 | P13-LOG-03 | TerminalSalesApprovalDialog.tsx | ~3 |
| 4 | P13-LOG-04 | SalesEntryDialog.tsx | 2 |
| 5 | P13-LOG-05 | ManualPurchaseEntryDialog.tsx | 1 |
| 6 | P13-LOG-06 | TerminalPurchaseApprovalDialog.tsx | ~3 |
| 7 | P13-LOG-07 | StockTransactionsTab.tsx | ~7 |
| 8 | P13-LOG-08 | WalletLinkingSection.tsx | 1 |
| 9 | P13-LOG-09–16 | 8 hooks files | ~29 |
| 10 | P13-LOG-17 | 4 terminal component files | ~12 |
| 11 | P13-LOG-18 | 3 utils files | ~7 |
| 12 | P13-LOG-19 | LoginPage.tsx | 1 |

**Total: ~27 files cleaned, ~85 console.log calls removed**

No database changes needed. All `console.error` and `console.warn` preserved. Edge function logs excluded.

### Security-Critical Items

- `TerminalRolesList.tsx` dumps full RPC params as JSON to console
- `LoginPage.tsx` logs authenticated user object
- `ChatImageUpload.tsx` logs pre-signed S3 URLs (temporary credentials)

### Technical Details

After this batch, the remaining ~580 console.log calls are spread thinly across 12+ files. The `(supabase as any)` type bypass (64 files, 1377 occurrences) remains deferred pending Supabase type regeneration.

