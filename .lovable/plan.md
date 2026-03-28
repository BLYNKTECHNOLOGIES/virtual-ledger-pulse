
# Supabase Auth Migration Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 1 - Create auth accounts | ✅ DONE | 19 users synced with matching UUIDs, 34 junk entries cleaned |
| 2 - Dual-mode login | ✅ DONE | useAuth.tsx + LoginPage.tsx updated, backdoor removed |
| 3 - Migrate localStorage readers | 🔲 TODO | 25+ files need refactoring |
| 4 - Tighten RLS policies | 🔲 TODO | 329 policies to rewrite |
| 5 - Cleanup | 🔲 TODO | Remove legacy auth code |

Temp password for all Supabase Auth accounts: `BlynkTemp2026!`

---


# ERP Task Email Notifications via Google Workspace SMTP

## Overview
Add email notifications to the task management system using Google Workspace SMTP. A new `send-task-email` Edge Function will handle all email sending via Nodemailer. Emails are fire-and-forget — failures never block task operations.

---

## Prerequisites (Your Action Required)

You need to generate a **Google App Password** (not your regular Gmail password):
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Sign in with your Google Workspace account
3. Select "Mail" as the app, "Other" as the device (name it "ERP")
4. Copy the 16-character password generated

I'll then store 3 secrets in Supabase:
- `SMTP_HOST` → `smtp.gmail.com`
- `SMTP_USER` → your Google Workspace email
- `SMTP_PASS` → the App Password

---

## Step 1 — Database: `email_notification_log` Table

Create a logging table to track sent emails and prevent duplicates:
- Columns: `id`, `task_id`, `recipient_user_id`, `recipient_email`, `event_type`, `status` (sent/failed), `error_message`, `created_at`
- Unique constraint on `(task_id, recipient_user_id, event_type, DATE(created_at))` to prevent daily spam

---

## Step 2 — Edge Function: `send-task-email`

Single Edge Function handling 5 event types via Nodemailer SMTP:

**Input**: `{ eventType, taskId, taskTitle, taskDescription, assignedByName, dueDate, status, recipientUserIds }`

**Logic**:
1. Fetch recipient emails from `public.users` table by user IDs
2. Check `email_notification_log` for same-day duplicates
3. Render HTML from inline template based on event type
4. Send via SMTP (`smtp.gmail.com:587`, TLS)
5. Log result to `email_notification_log`

**5 Email Templates** (clean, professional HTML):
- `task_assigned` — "A new task has been assigned to you"
- `task_reassigned` — "A task has been reassigned to you"
- `task_overdue` — "Task is overdue"
- `task_due_soon` — "Task approaching deadline"
- `task_mention` — "You were mentioned in a task comment"

Each includes: task title, description snippet, assigned by, due date, status badge, and a direct link to the task.

---

## Step 3 — Wire Triggers into Existing Code

Add non-blocking `supabase.functions.invoke('send-task-email', { body })` calls (wrapped in try/catch) at these points:

| Location | Event | Recipients |
|----------|-------|------------|
| `useTasks.ts` → `useCreateTask` | Task assigned | Assignee |
| `useTasks.ts` → `useUpdateTask` | Task reassigned | New assignee |
| `useTaskComments.ts` → `useAddTaskComment` | @mention | Mentioned users |

All calls are fire-and-forget — email failure will not affect task operations.

---

## Step 4 — Update `task-due-notifications` Edge Function

Add SMTP email sending directly inside the existing due-notifications function for overdue and due-soon events (already runs server-side with service role). This avoids an extra function-to-function call.

---

## Technical Notes

- **SMTP Library**: `npm:nodemailer` (works in Deno Edge Functions)
- **Modular**: All SMTP config in one place — easily swappable to another provider later
- **Dedup**: One email per task+user+event per day via `email_notification_log`
- **User emails**: Always fetched from `public.users.email` — no duplication
- **Visibility respected**: Only users with task access receive emails
- **Google Workspace limit**: ~500 emails/day (sufficient for internal ERP)

