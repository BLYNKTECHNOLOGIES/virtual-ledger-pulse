## Verdict up front

- **F8 — legitimate, not built.** `hr_drift_alerts` has no tolerance/classification/auto-dismiss columns and no reason taxonomy. Every rupee-rounding delta today reads as "open drift" and forces HR to review noise.
- **F9 (ghost-email half) — mostly already built.** The `razorpay-payroll-proxy` already runs the Gmail-`+alias` recovery in-line when RazorpayX blocks an email as ghost. What's missing is a **surface** for the residual cases where even the alias flow fails.
- **F9 (dispatcher half) — legitimate, not built.** `hr_email_send_log` has only `status/error_message/created_at` — no `attempt_count`, no `next_retry_at`, no dead-letter marker. 3 rows are currently stuck at "pending". No retry loop exists.
- **F10 — likely already correct, needs certification.** `auto-absent-marking/index.ts` is already v4-window-aware: uses the 05:00 IST window boundary, shifts back 2 days when it fires in the 00:00–05:00 grey zone, gates on `absent_if_no_punch`, skips holidays / approved leave / weekly-off / already-handled dailies. F10 is a **read + prove**, not a rewrite.

## My view

F8 is the highest-leverage of the three. Without it, the shadow ritual never sees adoption — you'll open the drift page, see 30+ open rows that are all ±₹2 rounding, close the tab, and the Razorpay-vs-HRMS validation exercise silently dies. F9-dispatcher is small and pays back forever (no more "why didn't payroll get emailed" mysteries). F9-ghost-email is mostly cosmetic since the recovery is already automated. F10 is 15 minutes with the code — mostly documentation.

Order I recommend: **F8 → F9-dispatcher → F9-ghost-email surface → F10 cert**. Small, sequenced, no cross-dependencies.

---

## F8 · Drift auto-triage

### What changes
Add classification to every drift row so HR sees only unexplained lines.

**Backend**
- Extend `hr_drift_alerts` with `auto_status` (`open` | `auto_dismissed` | `auto_labeled`), `auto_reason` (short code like `within_tolerance`, `tds_gated`, `lop_pre_close`, `mid_month_revision`), `delta_amount` (numeric, when both sides are numeric), `tolerance_used` (numeric).
- New SQL helper `hr_classify_drift(row)` that computes `auto_status` + `auto_reason` from the row's field name and values, using:
  - **±₹5 tolerance** for salary/CTC/component fields (numeric compare).
  - **Cause labels** for the three known patterns:
    - TDS field mismatch while `push_tds_endpoint_verified=false` in `hr_razorpay_settings` → `tds_gated`.
    - LOP-days mismatch when the affected month has open watchdog sessions or unresolved regularization requests → `lop_pre_close`.
    - Any structure-field mismatch where a `hr_salary_revisions` row was pushed within the current month → `mid_month_revision`.
- Trigger on `hr_drift_alerts` insert/update runs the classifier so every write auto-labels itself.
- One-time backfill classifies existing 36 open rows.
- New RPC `hr_open_unexplained_drift_count()` — the only counter the close-month gate uses.

**Frontend**
- Drift list on `SystemPulsePage.tsx` / `RazorpaySyncPage.tsx` defaults to **"Unexplained only"** with a segmented filter: `Unexplained · Auto-labeled · Auto-dismissed · All`.
- Each auto-labeled/auto-dismissed row shows a small chip explaining why (e.g. "±₹3 rounding", "TDS gated", "structure revision this month").
- Monthly Payroll Cockpit's close-month gate reads `hr_open_unexplained_drift_count()` instead of raw open count.

### Situation after F8
- Backend: `hr_drift_alerts` becomes a labeled ledger, not a flat list. Every row carries its own explanation.
- Frontend: the drift page shows 2–5 lines a month that HR actually needs to touch. Close-month button unblocks itself once those are resolved.
- HR touch: only genuinely unexplained lines.

---

## F9 · Two halves

### F9a — Dispatcher self-healing (real work)

**Backend**
- Add `attempt_count int default 0`, `next_retry_at timestamptz`, `dead_letter boolean default false`, `last_error text` to `hr_email_send_log`.
- New cron (every 5 min) → edge function `hr-email-dispatch-retry`: picks rows where `status='pending' AND created_at < now() - '15 min' AND dead_letter=false`, re-invokes the original send function, increments `attempt_count`, sets exponential `next_retry_at` (15m, 45m, 2h). At `attempt_count >= 3`, sets `dead_letter=true` and inserts a `hr_drift_alert` (`field='email_dispatch_dead_letter'`).
- System Pulse gains a **"Dead-lettered emails"** tile.

**Situation after F9a**
- Backend: transient SMTP hiccups self-heal within 15 min. Terminal failures land in a visible dead-letter queue.
- Frontend: existing 3 stuck rows either send or dead-letter cleanly. New tile on System Pulse. No new HR pages.
- HR touch: only when the dead-letter tile is non-zero.

### F9b — Ghost-email surface (light work — recovery is already automatic)

The alias-recovery flow already runs inside `razorpay-payroll-proxy` (`gmail_alias_after_ghost_email`). The only missing piece is a **visible surface** for the small subset where even that fails.

**Backend**
- New SQL view `hr_ghost_email_residual_v` reading `hr_razorpay_sync_log` for `action='create_person'` rows whose latest attempt has `code IN ('RAZORPAY_EMAIL_EXISTS','RAZORPAY_ALIAS_MAPPING_FAILED')` and no successful follow-up.

**Frontend**
- Small "Ghost-email residuals" card on the RazorpaySync page (hidden when empty), with a one-click "Retry alias recovery" button.

**Situation after F9b**
- Backend: no new logic — just a read view.
- Frontend: a card that stays empty most days.
- HR touch: only the residual cases.

---

## F10 · Absence-ownership certification

Not a rewrite. A **prove-and-document** pass.

**Backend**
- Add three Deno tests under `supabase/functions/auto-absent-marking/`:
  1. Running at IST 02:00 marks the window ending 05:00 IST **two days ago**.
  2. Running at IST 08:00 marks the window ending 05:00 IST **yesterday**.
  3. Approved leave, weekly-off, holiday, and pre-existing non-`no_data` dailies are all skipped.
- Add a `hr_absent_marker_last_run_v` SQL view over `hr_attendance_absent_marker_runs` exposing last-24h health.

**Frontend**
- System Pulse tile "Auto-absent marker" → green when today's run exists and `marked_count` is sane vs roster, amber if it hasn't run, red if it errored.
- Add a one-paragraph doctrine note in `docs/hrms/AUTO_ABSENT.md` describing the window semantics so it's certified in writing.

**Situation after F10**
- Backend: unchanged code, but now covered by tests and a health view.
- Frontend: one tile on System Pulse showing "ran today at HH:MM IST, marked N".
- HR touch: zero unless the tile goes amber/red.

---

## Sequenced delivery

1. F8 schema + classifier + backfill + frontend filter + cockpit gate rewire.
2. F9a schema + retry cron + dead-letter tile.
3. F9b residual view + card.
4. F10 tests + view + tile + doctrine note.

All four ship as small, independently reviewable slices.

## Technical notes (for the record)

- Drift classifier and dispatcher retry both need `service_role` because they run under crons.
- `hr_drift_alerts` unique key stays `(hr_employee_id, field)`; the classifier writes to the same row via `UPDATE`.
- The retry cron uses `pg_cron + net.http_post` (same pattern as the F6 snapshot-refresh you scheduled last turn).
- F10 tests use Deno's stdlib assert and mock `Date.now()` — no live DB.
