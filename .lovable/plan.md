# Follow-up Cleanup of Outdated / Unused Database Objects

I re-audited all **public tables and views** against the entire frontend (`src/`, excluding the auto-generated `types.ts`), every edge function, and every database function/trigger. Almost everything flagged as a "code orphan" is actually alive via RPC, triggers, or audit-logging functions (e.g. `terminal_bypass_codes`, `terminal_webauthn_credentials`, `reversal_guards`, `terminal_mpi_snapshots`, `terminal_permission_change_log`, `permission_enforcement_config/log`, the balance-drift views). Those are kept.

Only the objects below are genuinely dead — no UI usage, no edge-function usage, no live DB-function usage, and no incoming foreign keys.

## Confirmed dead — safe to drop

| Object | Type | Rows | Why it's dead |
|---|---|---|---|
| `employee_offboarding` | table | 0 | Superseded by the live resignation flow (`hr_resignation_checklist`, `hr_resignation_checklist_template`, `hr_fnf_settlements`). The Separation page uses those, never this table. Zero code/function refs. |
| `journal_entries` | table | 0 | The Accounting "Journal Entries" tab is a hard-coded "Coming Soon" placeholder that never queries it. Only reference is a cleanup line in `delete_user_with_cleanup`. |
| `p2p_order_types` | table | 5 (seed) | Unused lookup table. The terminal P2P system runs entirely on `p2p_order_records` (47,750 rows). Zero code/function refs. |
| `daily_reconciliation_summary` | view | — | Unused diagnostic view. Zero references in code or DB functions. |

## Kept (verified alive, do NOT drop)
- `hr_attendance_activity_archive`, `hr_attendance_punches_archive` — empty now but are the write targets of the `archive_old_attendance_data` archival function. Intentional sinks.
- `terminal_permission_change_log` (370 rows), `permission_enforcement_config/log` — actively written/read by `log_terminal_permission_change` and the `require_permission` guard (used by ~14 RPCs).
- `erp_balance_drift_report`, `erp_post_baseline_drift`, `bank_accounts_with_balance`, `hr_monthly_hours_summary` — referenced by balance-healing functions and/or UI pages.

## Approach

```text
1. Migration (single):
   - DROP FUNCTION dependency edit first: recreate delete_user_with_cleanup
     WITHOUT the journal_entries cleanup line (its only reference).
   - DROP VIEW  public.daily_reconciliation_summary;
   - DROP TABLE public.employee_offboarding;
   - DROP TABLE public.journal_entries;
   - DROP TABLE public.p2p_order_types;
2. Re-run a quick dependency check after the migration to confirm no
   function/trigger still references the dropped objects.
3. types.ts regenerates automatically post-migration (no manual edit).
```

## Technical details
- Pre-flight already done: no foreign keys point into any of the four objects, and no trigger is named for or attached via them.
- The only code-side touchpoint is `delete_user_with_cleanup`, which deletes from `journal_entries` during user unlinking. That line will be removed in the same migration so the function keeps working.
- No UI changes are required — none of these objects render anywhere. The Accounting "Journal Entries" placeholder tab stays as-is (it does not read the table).

## Note
This is a pure backend/data-model cleanup, consistent with the project's data-integrity priority. If you'd prefer to keep `p2p_order_types` (it holds 5 seed rows) in case the terminal later wires an order-type lookup, I can exclude it and drop only the other three.
