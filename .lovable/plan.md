# ERP Full System Audit — Phase 20 Report

## Phases 1-19 Status (completed)

All previous phases complete: data integrity, orphaned code, permissions, XSS, dead code, console.log cleanup (client-side), confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination, 'Current User' audit fix, polling standardization (30s), silent catch blocks, OTP system removal, hardcoded backdoor removed, anonymous policies dropped.

---

## CATEGORY A: Security — verify-binance-keys Leaks Secrets (1 item) exempt this

### P20-SEC-01: Edge function exposes partial API keys and proxy URL

**Impact: HIGH** — `verify-binance-keys` has `verify_jwt = false` and returns first 4-20 characters of `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_PROXY_TOKEN`, and `BINANCE_PROXY_URL` in its HTTP response. Anyone on the internet can call this endpoint and extract partial secrets.

Lines 21-24 of `supabase/functions/verify-binance-keys/index.ts`:

```
BINANCE_PROXY_URL: `Set (${BINANCE_PROXY_URL.substring(0, 20)}...)`
BINANCE_API_KEY: `Set (${BINANCE_API_KEY.substring(0, 8)}...${BINANCE_API_KEY.slice(-4)})`
BINANCE_API_SECRET: `Set (${BINANCE_API_SECRET.substring(0, 4)}...${BINANCE_API_SECRET.slice(-4)})`
BINANCE_PROXY_TOKEN: `Set (${BINANCE_PROXY_TOKEN.substring(0, 4)}...)`
```

**Fix:** Rewrite to return only boolean flags:

```typescript
{ proxy_url_configured: true, api_key_configured: true, api_secret_configured: true, proxy_token_configured: true, proxy_ping: "OK", api_key_valid: true }
```

---

## CATEGORY B: Config Hygiene — Stale config.toml entries (1 item)

### P20-CFG-01: config.toml references deleted edge functions

3 edge functions were deleted in Phase 19 but their `verify_jwt = false` entries remain in `supabase/config.toml`:

- `send-password-reset-otp` (line 54)
- `reset-password-with-otp` (line 48)
- `verify-password-reset-otp` (line 62)

**Fix:** Remove these 6 lines from config.toml.

---

## CATEGORY C: Code Quality — useEffect fetch patterns (3 components)

### P20-QUAL-01: AvailablePaymentGateways uses useEffect+useState instead of useQuery

`src/components/bams/payment-gateway/AvailablePaymentGateways.tsx` — manual `useEffect(() => { fetchPaymentGateways(); }, [])` with `useState` for loading/data. No caching, no deduplication, no error retry.

**Fix:** Refactor to `useQuery` with `queryKey: ['payment-gateways']`. After mutations (add/edit), call `queryClient.invalidateQueries`.

### P20-QUAL-02: PendingSettlements uses useEffect+useState

`src/components/bams/payment-gateway/PendingSettlements.tsx` — same pattern. Two `useEffect` fetches for settlements and bank accounts.

**Fix:** Refactor both fetches to `useQuery`. Bank accounts query can be shared/cached.

### P20-QUAL-03: SettlementSummary uses useEffect+useState

`src/components/bams/payment-gateway/SettlementSummary.tsx` — same pattern with two `useEffect` fetches.

**Fix:** Refactor to `useQuery`.

---

## CATEGORY D: Edge Function Console Logging (1 item)

### P20-LOG-01: binance-assets edge function has 20+ console.log calls

`supabase/functions/binance-assets/index.ts` has extensive `console.log` calls that expose request payloads, API responses, and partial data in Supabase edge function logs. While edge function logs are not public, this is excessive for production.

**Fix:** Replace verbose `console.log` with structured logging: keep action-level logs (what action was called, success/failure) but remove payload dumps and response body logging. Use `console.info` for operational events and `console.error` for failures only.

---

## Summary Table


| #   | ID          | Severity | Action                                                 | Target                                        |
| --- | ----------- | -------- | ------------------------------------------------------ | --------------------------------------------- |
| 1   | P20-SEC-01  | HIGH     | Stop leaking partial API keys/secrets                  | verify-binance-keys edge function exempt this |
| 2   | P20-CFG-01  | LOW      | Remove stale config.toml entries for deleted functions | supabase/config.toml                          |
| 3   | P20-QUAL-01 | MEDIUM   | Refactor AvailablePaymentGateways to useQuery          | AvailablePaymentGateways.tsx                  |
| 4   | P20-QUAL-02 | MEDIUM   | Refactor PendingSettlements to useQuery                | PendingSettlements.tsx                        |
| 5   | P20-QUAL-03 | MEDIUM   | Refactor SettlementSummary to useQuery                 | SettlementSummary.tsx                         |
| 6   | P20-LOG-01  | LOW      | Reduce verbose edge function logging                   | binance-assets/index.ts                       |


**Total: 1 secret leak closed, 3 stale config entries removed, 3 components refactored to useQuery, 1 edge function logging cleaned up**

### Technical Details

**verify-binance-keys rewrite:** The function currently has no JWT verification and returns partial key strings. The fix keeps the proxy ping and API validity test but returns only boolean results. No frontend changes needed since the function is only called from the Binance settings panel which already handles boolean responses.

**useQuery refactors:** All 3 payment gateway components follow the same pattern: `useState` + `useEffect` + manual `setLoading`. Converting to `useQuery` gives automatic caching, retry, deduplication, and loading states. The `onSuccess` callbacks after mutations become `queryClient.invalidateQueries({ queryKey: ['...'] })`.

**config.toml cleanup:** The stale entries for deleted OTP functions are harmless but create confusion. Removing them keeps the config aligned with the actual deployed functions.