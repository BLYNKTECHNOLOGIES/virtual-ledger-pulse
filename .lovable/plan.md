# ERP Full System Audit — Phase 19 Report

## Phases 1-18 Status (completed)

All previous phases complete: data integrity fixes, orphaned code removal, permissions cleanup, XSS fixes, dead tabs/tables, dead hooks/utils/components, console.log cleanup (client-side complete), native confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination, 'Current User' audit fix, polling reduction (10s→30s), silent catch blocks, hardcoded password backdoor removed, anonymous role policies dropped.

---

## CATEGORY A: Performance — Remaining 15s Polling (5 locations)

Phase 18 reduced all 10s polling to 30s, but 5 bank-related queries still poll at 15s with `staleTime: 0`. Bank balances don't change every 15 seconds.

### P19-PERF-01: Bank account queries polling at 15s (5 files)

- `src/components/bams/BankAccountManagement.tsx` line 106: `refetchInterval: 15000, staleTime: 0`
- `src/components/bams/AccountSummary.tsx` line 159: `refetchInterval: 15000`
- `src/hooks/useActiveBankAccounts.tsx` line 52: `refetchInterval: 15000`
- `src/components/widgets/BankBalanceFilterWidget.tsx` line 106: `refetchInterval: 15000`
- `src/components/dashboard/DashboardWidget.tsx` line 63: `refetchInterval: 15000`

**Fix:** All 5 → `refetchInterval: 30000, staleTime: 10000`. Consistent with the 30s standard established in Phase 18.

### P19-PERF-02: PayerModule polling at 10s

- `src/hooks/usePayerModule.ts` line 92: `refetchInterval: 10_000`

Payer order locks need reasonably fresh data but 10s is excessive.

**Fix:** `refetchInterval: 20000, staleTime: 8000`. Payer locks are more time-sensitive than bank balances but don't need 10s.

---

## CATEGORY B: Security — OTP In-Memory Storage Bypass (1 item)

### P19-SEC-01: OTP stored in edge function memory, not database

**Impact: HIGH** — The `send-password-reset-otp` and `reset-password-with-otp` edge functions store OTPs in in-memory `Map` objects. Since these are separate function instances, the verify function can never see OTPs created by the send function. This means password reset is **fundamentally broken** or accepts any OTP.

**Fix:**
1. Create a `password_reset_tokens` table with columns: `id`, `email`, `otp_hash`, `created_at`, `expires_at`, `used`, `attempts`
2. Update `send-password-reset-otp` to insert hashed OTP into database
3. Update `reset-password-with-otp` to verify against database, mark as used
4. Add rate limiting (max 5 attempts per token)
5. Add cleanup: delete expired tokens older than 1 hour

---

## CATEGORY C: Security — verify-binance-keys Leaks Partial API Keys (1 item)

### P19-SEC-02: Edge function returns partial API key strings

**Impact: MEDIUM** — `verify-binance-keys` returns first 4-8 chars of Binance API keys in HTTP response. Combined with `verify_jwt = false`, anyone can probe which secrets are configured and get partial key data.

**Fix:** Redeploy the edge function to return only boolean flags:
```typescript
{
  api_key_configured: !!BINANCE_API_KEY,
  api_secret_configured: !!BINANCE_API_SECRET,
  proxy_url_configured: !!BINANCE_PROXY_URL
}
```

---

## CATEGORY D: Code Quality — Silent `.catch(() => {})` in email notifications (1 item)

### P19-QUAL-01: Task email notifications silently swallow errors

- `src/utils/taskEmail.ts` line 80: `.catch(() => {})`
- `src/hooks/useTasks.ts` lines 332, 422: `.catch(() => {})`

These fire-and-forget notification calls silently discard errors. While notifications are non-critical, we should at least log failures.

**Fix:** Replace `.catch(() => {})` with `.catch((err) => console.warn('Notification send failed:', err.message))`.

---

## Summary Table

| # | ID | Severity | Action | Target |
|---|------|----------|--------|--------|
| 1 | P19-PERF-01 | MEDIUM | Reduce bank account polling 15s → 30s | 5 bank-related files |
| 2 | P19-PERF-02 | LOW | Reduce payer module polling 10s → 20s | usePayerModule.ts |
| 3 | P19-SEC-01 | HIGH | Move OTP storage from memory to database | 2 edge functions + migration |
| 4 | P19-SEC-02 | MEDIUM | Stop leaking partial API keys | verify-binance-keys edge function |
| 5 | P19-QUAL-01 | LOW | Add console.warn to silent notification catches | taskEmail.ts, useTasks.ts |

**Total: 6 polling reductions (completing the 30s standardization), 1 broken OTP system fixed, 1 key leak closed, 3 silent catches instrumented**
