

# Phase 26: A14 + A15 + A16

## A16 — MPI Timezone: ALREADY FIXED

Phase 25 (last migration) replaced `created_at::date` with `(created_at AT TIME ZONE 'Asia/Kolkata')::date` in both locations within `generate_terminal_mpi_snapshots`. **No action needed.**

---

## A14 — SLA Check Cron Frequency

**Current state:** `check_terminal_order_sla` runs every 5 minutes (`*/5 * * * *`). The deduplication window is 15 minutes, so breaching orders get re-notified at most every 15 minutes regardless. With only 15 historical assignments, every invocation is mostly a no-op — 2 wasted queries per cycle.

**Fix:** Change the cron interval from `*/5 * * * *` to `*/10 * * * *` (every 10 minutes). This halves the unnecessary query load while still catching SLA breaches well within the 15-minute dedup window.

### Migration
```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'terminal-sla-check'),
  '*/10 * * * *'
);
```

---

## A15 — send-task-email Auth Inconsistency

**Current state:** `send-task-email` uses SMTP directly (denomailer) with `verify_jwt=false` and has no internal auth check. Any unauthenticated HTTP POST can trigger task notification emails.

**Fix:** Add JWT validation at the top of the function — extract the Bearer token, call `supabase.auth.getUser(token)`, return 401 if invalid. This matches the pattern already used in `admin-reset-password` and `create-erp-user`.

### File: `supabase/functions/send-task-email/index.ts`
Add after CORS preflight check:
```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

Note: `verify_jwt` stays `false` in config.toml (consistent with other functions that do in-code validation).

---

## Summary

| # | Item | Action | Target |
|---|------|--------|--------|
| A14 | SLA cron frequency | Change `*/5` to `*/10` | Migration (cron.alter_job) |
| A15 | send-task-email auth | Add JWT validation in code | Edge function |
| A16 | MPI timezone | No action — fixed in Phase 25 | — |

**1 migration, 1 edge function edit.**

