

# Phase 25: W28 (IST Timezone) + W29 (Admin Auth Hardening)

## W28 — IST Timezone Fix

**Problem:** `generate_terminal_mpi_snapshots` and `check_terminal_order_sla` use `created_at::date` which casts in UTC. Orders placed at 11:30 PM IST (6 PM UTC) get attributed to the wrong day. The SLA 10-minute check also compares against UTC `now()`.

**Fix (1 migration):**

### `generate_terminal_mpi_snapshots` — 2 locations:
```
-- Line 71 equivalent:
AND (toa.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date

-- Line 94 equivalent:
AND (toa.created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
```

### `check_terminal_order_sla` — 2 locations:
The SLA function uses `toa.created_at < now() - interval '10 minutes'` and `pol.created_at < now() - interval '10 minutes'`. These are duration-based comparisons (elapsed time), not date attribution — they work correctly regardless of timezone. **No change needed** for the 10-minute threshold.

However, the deduplication check `tn.created_at > now() - interval '15 minutes'` is also duration-based — also correct.

**Conclusion for W28:** Only `generate_terminal_mpi_snapshots` needs the IST fix (2 occurrences of `::date` cast). `check_terminal_order_sla` uses elapsed-time comparisons, not date attribution, so it's already correct.

---

## W29 — admin-reset-password Authorization

**Current state:** The function already validates the Bearer token via `adminClient.auth.getUser(token)` and checks admin role (lines 41-81). The `callerUserId` bypass was removed in Phase 24. The function now correctly:
1. Requires a valid Bearer token (returns 401 if missing/invalid)
2. Verifies the caller has admin/super admin role (returns 403 if not)

**Assessment:** W29 is **already fixed** by Phase 24. The function is not callable "by anyone with the project URL" — it requires a valid authenticated admin JWT. Adding an additional `x-admin-secret` header would be defense-in-depth but is redundant given the JWT + role check is solid.

**Recommendation:** No further changes needed. The JWT + role verification is the standard pattern and is already enforced.

---

## Summary

| # | Item | Action | Target |
|---|------|--------|--------|
| W28 | IST timezone in MPI snapshots | Replace `::date` with `AT TIME ZONE 'Asia/Kolkata'` (2 locations) | Migration: `generate_terminal_mpi_snapshots` |
| W28 | IST timezone in SLA check | No action — uses elapsed time, not date attribution | — |
| W29 | Admin reset password auth | No action — already hardened in Phase 24 | — |

**1 migration, 0 frontend changes.**

