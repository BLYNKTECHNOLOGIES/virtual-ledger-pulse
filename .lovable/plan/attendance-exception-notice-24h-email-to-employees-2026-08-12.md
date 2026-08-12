# Attendance Exception Notice — 24h email to employees

When a day is marked **Absent** or **Half Day**, the employee gets one email from HR 24 hours later, showing that day's office in/out details and telling them how to raise a regularization request in the ERP.

## Step 0 — Sample first (before any implementation)

A single test email is sent to [shubham.singh@blynkex.com](mailto:shubham.singh@blynkex.com) from **[hr@blynkex.com](mailto:hr@blynkex.com)** (the configured HR mailbox), rendered with a real recent exception day so the wording, numbers and link are exactly what employees would receive. Nothing else is turned on until it is approved.

## What the email contains

- Employee name, date (with weekday), and the marked status: **Absent** or **Half Day**.
- Recorded office in / out times, total hours worked, late-by / early-out minutes, punch count. When there are no punches at all it says "No punches recorded" instead of blank times.
- Which shift the day was judged against.
- A plain statement that this is an automated attendance notice, not a penalty decision.
- If the employee disagrees: raise an **Attendance Regularization Request** from the ERP profile → Attendance tab, with a direct button to [https://erp.blynkex.com/profile?tab=attendance](https://erp.blynkex.com/profile?tab=attendance).
- HR signature/footer, same visual style as the existing regularization emails.

## When it sends

- Runs 12 hourly. Picks up days marked absent/half_day where the mark is **at least 24 hours old** and no notice was sent yet for that employee+date.
- One email per employee per date, ever (idempotent — a re-run or a recompute never re-mails).
- Skips: employees without an email address, inactive employees, days that already have a regularization request raised, days already regularized/approved, and days where an open Watchdog stale-session hold exists (fairness rule — those are HR's to resolve, not the employee's).
- If the day's status later changes (e.g. engine recompute turns absent → present) before the 24h mark, no email goes out.
- A backfill guard: on first activation only days from the activation date onward are considered, so no burst of mail about old history. Historical send can be triggered manually by HR if wanted.

## Technical outline

**Database**

- New table `hr_attendance_notice_log`: `employee_id`, `attendance_date`, `status_at_send`, `email`, `sent_at`, `status` (sent/failed/skipped), `error_message`, `campaign_ref`. Unique on `(employee_id, attendance_date)` — this is the idempotency key. Standard GRANTs + RLS (HR staff read via `public.hr_is_hr_staff()`, service_role full).
- Eligibility read comes from `hr_attendance_daily` (`status`, `first_in`, `last_out`, `total_hours`, `late_by_minutes`, `early_by_minutes`, `punch_count`, `detected_shift_id`, `updated_at`) joined to `hr_employees` (active + email), left-joined to `hr_attendance_regularization_requests` and the open-stale-session gate.

**Email template**

- New template `attendance-exception-notice` registered in `supabase/functions/_shared/transactional-email-templates/registry.ts`, styled like `regularization-approval.tsx` (react-email components, same container/accent conventions; amber accent for half day, red for absent).

**Edge function**

- New `hr-attendance-exception-notify` (service role, `verify_jwt` off, zod-validated body):
  - `action: "preview"` → renders and sends one sample to a supplied address using a chosen or synthetic day (used for Step 0).
  - `action: "run"` → the hourly sweep described above; inserts the log row first (`ON CONFLICT DO NOTHING`) and only sends when the insert claimed the row, then updates status; chunked with per-recipient error capture; also writes to `hr_email_send_log` so HR Logs keeps working.
  - Sends via SMTP using the `hr_mailboxes` row for [hr@blynkex.com](mailto:hr@blynkex.com) (same denomailer + secret-name pattern as `hr-mail-send`), so the From address is the HR mailbox the owner already configured.
- `pg_cron` job (via the insert tool, per convention) calling it hourly.

**HRMS surface**

- Small "Attendance notices" panel on the HR Logs page: last 50 notices with date, employee, status, send result, and a Resend-failed action. No new route.

## Build order

1. Send the sample email to [shubham.singh@blynkex.com](mailto:shubham.singh@blynkex.com) and stop for approval.
2. On approval: table + RLS/grants, template registration.
3. Edge function `run` path + cron.
4. HR Logs panel.