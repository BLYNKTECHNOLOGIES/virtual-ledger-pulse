

# ERP Task Management Module — Implementation Plan

## Overview
Build a complete task management module inside the existing ERP with database tables, permissions, sidebar entry, routing, and full UI. The system provides controlled internal task assignment with visibility rules, assignment chain tracking, comments, activity logs, recurring tasks, and notifications.

---

## Phase 1: Database Schema (Migration)

### Tables to create:

**1. `erp_tasks`** — Core task table
- `id` (uuid, PK), `title` (text, required), `description` (text), `status` (enum: open/in_progress/completed), `priority` (enum: low/medium/high/critical)
- `created_by` (uuid → users), `assignee_id` (uuid → users), `due_date` (timestamptz)
- `is_recurring` (boolean), `recurrence_type` (text: daily/weekly), `recurrence_days` (int[]), `recurrence_time` (time), `parent_task_id` (uuid → self, for recurring instances)
- `completed_at` (timestamptz), `created_at`, `updated_at`
- `tags` (text[])

**2. `erp_task_assignments`** — Assignment chain history
- `id`, `task_id` → erp_tasks, `from_user_id` → users, `to_user_id` → users, `assigned_at` (timestamptz)

**3. `erp_task_spectators`** — Spectator access
- `id`, `task_id` → erp_tasks, `user_id` → users, `added_by` → users, `added_at`

**4. `erp_task_comments`** — Comments
- `id`, `task_id` → erp_tasks, `user_id` → users, `content` (text), `mentions` (text[]), `created_at`

**5. `erp_task_activity_log`** — Audit trail
- `id`, `task_id` → erp_tasks, `user_id` → users, `action` (text), `details` (jsonb), `created_at`

**6. `erp_task_attachments`** — File attachments
- `id`, `task_id` → erp_tasks, `uploaded_by` → users, `file_name` (text), `file_url` (text), `file_size` (bigint), `created_at`

**7. `erp_task_templates`** — Reusable templates
- `id`, `title`, `description`, `priority`, `tags`, `created_by` → users, `created_at`

### RLS Policies
- All tables use permissive anon access (consistent with project's custom auth pattern where `auth.uid()` is NULL)

### Permissions
- Add `tasks_view` and `tasks_manage` to `app_permission` enum
- Add to Admin/Super Admin permission sets in `usePermissions.tsx`

---

## Phase 2: Frontend — Routing & Navigation

**Files to modify:**
- `src/App.tsx` — Add `/tasks` route with standard Layout wrapper
- `src/components/AppSidebar.tsx` — Add "Tasks" sidebar item with `CheckSquare` icon
- `src/hooks/usePermissions.tsx` — Add `tasks_view`, `tasks_manage` to admin permissions
- `src/components/MobileBottomNav.tsx` — Add Tasks entry (if applicable)

---

## Phase 3: Task List Page (`src/pages/Tasks.tsx`)

- Clean table view with columns: Title, Assignee, Priority, Due Date, Status
- Search by title
- Filters: Status, Priority, Assignee, Overdue toggle
- Sort by due date / priority
- "Show Completed" toggle (hidden by default)
- Visibility enforced client-side: show only tasks where user is creator, assignee, or spectator (Admin/Super Admin see all)
- Priority color indicators: Low (neutral), Medium (blue), High (orange), Critical (red)
- Overdue/Due Soon badges
- Bulk actions toolbar: reassign, change status

---

## Phase 4: Task Detail Dialog/Panel

**`src/components/tasks/TaskDetailDialog.tsx`**
- Title, description, status, priority, due date display
- Assignment chain visualization (A → B → C → D)
- Spectators list with add/remove
- Tabs/sections for:
  - **Comments** — chronological, showing full name + username + timestamp, @mention support
  - **Activity Log** — collapsible timeline of all tracked actions

---

## Phase 5: Task Create/Edit Dialog

**`src/components/tasks/TaskFormDialog.tsx`**
- Title (required), Description (multiline), Assignee (user picker), Due date+time, Priority selector
- Optional: Tags, Spectators (multi-user select), Attachments
- Recurring toggle: Daily / Weekly (with day selector), Time picker
- Keep form minimal and fast

---

## Phase 6: Supporting Components

- **`src/components/tasks/TaskAssignmentChain.tsx`** — Visual flow of assignment history
- **`src/components/tasks/TaskComments.tsx`** — Comment list + input with @mentions
- **`src/components/tasks/TaskActivityLog.tsx`** — Timeline of logged actions
- **`src/components/tasks/TaskPriorityBadge.tsx`** — Color-coded priority indicator
- **`src/components/tasks/TaskStatusBadge.tsx`** — Status with color coding
- **`src/components/tasks/TaskFilters.tsx`** — Filter bar component

---

## Phase 7: Hooks & Data Layer

- **`src/hooks/useTasks.ts`** — CRUD operations, filtering, visibility logic
- **`src/hooks/useTaskComments.ts`** — Comment operations
- **`src/hooks/useTaskActivity.ts`** — Activity log fetching
- All mutations log to `erp_task_activity_log` automatically
- Assignment changes insert into `erp_task_assignments`

---

## Phase 8: Notifications

- On task assign/reassign/comment/@mention/spectator add/due soon/overdue → insert into `terminal_notifications` table (reuse existing notification system)
- Leverage existing `useTerminalNotifications` hook for delivery

---

## Phase 9: Dashboard Widget

**`src/components/dashboard/widgets/MyTasksWidget.tsx`**
- Compact card showing: Open count, In Progress count, Overdue count
- List of top 5 urgent tasks (by priority + due date)
- Quick-open link to task detail

---

## Phase 10: User Profile Integration

- Add "My Tasks" section to `src/pages/UserProfile.tsx`
- Two tabs: "Assigned to me" / "Assigned by me"
- Allow status update, comment, reassignment inline
- Completed tasks hidden by default with toggle

---

## Technical Notes

- All user references use `public.users` table (custom auth, not `auth.users`)
- RLS follows existing anon-permissive pattern with SECURITY DEFINER functions
- Activity logging uses the existing `logAction` pattern from `system-action-logger.ts`
- Indian number formatting applied to any numeric displays
- Storage bucket `task-attachments` created for file uploads

