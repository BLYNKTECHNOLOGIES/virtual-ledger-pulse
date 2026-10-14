import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskDetailDialog } from './TaskDetailDialog';
import { isPast } from 'date-fns';
import { AlertTriangle, CalendarClock, CheckSquare, ChevronRight, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionBlock, ProfileEmptyState, ProfileSkeleton, StatusPill } from '@/components/profile/primitives';
import { fmtDay } from '@/components/profile/format';

import { usersDirectory } from '@/lib/usersDirectory';
const from = (table: string) => supabase.from(table as any);

async function fetchUserMap(userIds: Set<string>) {
  if (!userIds.size) return {};
  const { data } = await usersDirectory().select('id, first_name, last_name, username').in('id', Array.from(userIds));
  const map: Record<string, string> = {};
  ((data as any[]) || []).forEach((u: any) => { map[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown'; });
  return map;
}

/**
 * Tasks assigned to / created by the signed-in user. Shared with the profile
 * overview (same query keys, so both read one cache).
 */
export function useProfileTasks(kind: 'to-me' | 'by-me', showCompleted: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [kind === 'to-me' ? 'profile-tasks-to-me' : 'profile-tasks-by-me', user?.id, showCompleted],
    queryFn: async () => {
      if (!user?.id) return [];
      if (kind === 'to-me') {
        let q = from('erp_tasks').select('*').eq('assignee_id', user.id).order('created_at', { ascending: false });
        if (!showCompleted) q = q.neq('status', 'completed');
        const { data, error } = await q;
        if (error) throw error;
        const tasks = (data as any[]) || [];
        const ids = new Set<string>();
        tasks.forEach(t => { if (t.created_by) ids.add(t.created_by); });
        const map = await fetchUserMap(ids);
        return tasks.map(t => ({ ...t, creator_name: map[t.created_by] || 'Unknown' }));
      }
      let q = from('erp_tasks').select('*').eq('created_by', user.id).order('created_at', { ascending: false });
      if (!showCompleted) q = q.neq('status', 'completed');
      const { data, error } = await q;
      if (error) throw error;
      const tasks = (data as any[]) || [];
      const ids = new Set<string>();
      tasks.forEach(t => { if (t.assignee_id) ids.add(t.assignee_id); });
      const map = await fetchUserMap(ids);
      return tasks.map(t => ({ ...t, assignee_name: t.assignee_id ? (map[t.assignee_id] || 'Unknown') : 'Unassigned' }));
    },
    enabled: !!user?.id,
  });
}

export const isTaskOverdue = (t: any) => !!t.due_date && t.status !== 'completed' && isPast(new Date(t.due_date));

export function UserProfileTasks() {
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<'to-me' | 'by-me'>('to-me');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const qc = useQueryClient();
  // The task dialog refreshes the main task lists ('erp-tasks'); refresh this page's lists too when it closes.
  const onDetailOpenChange = (open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      qc.invalidateQueries({ queryKey: ['profile-tasks-to-me'] });
      qc.invalidateQueries({ queryKey: ['profile-tasks-by-me'] });
    }
  };

  const toMe = useProfileTasks('to-me', showCompleted);
  const byMe = useProfileTasks('by-me', showCompleted);
  const assignedToMe: any[] = toMe.data || [];
  const assignedByMe: any[] = byMe.data || [];
  const active = view === 'to-me' ? toMe : byMe;
  const tasks: any[] = view === 'to-me' ? assignedToMe : assignedByMe;
  const overdueCount = assignedToMe.filter(isTaskOverdue).length;

  const open = (id: string) => { setSelectedTaskId(id); setDetailOpen(true); };

  return (
    <SectionBlock
      icon={CheckSquare}
      title="Task list"
      description={overdueCount > 0 ? `${overdueCount} of your tasks ${overdueCount === 1 ? 'is' : 'are'} past the due date` : 'Tasks you were given and tasks you handed out'}
      flush
      actions={
        <div className="flex items-center gap-2">
          <Switch id="profile-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
          <Label htmlFor="profile-completed" className="text-xs text-muted-foreground">Show completed</Label>
        </div>
      }
    >
      <div className="border-b border-border px-3.5 py-2.5">
        <SegmentedControl
          size="sm"
          aria-label="Which tasks"
          value={view}
          onValueChange={(v) => setView(v as 'to-me' | 'by-me')}
          options={[
            { value: 'to-me', label: `Assigned to me · ${assignedToMe.length}` },
            { value: 'by-me', label: `Assigned by me · ${assignedByMe.length}` },
          ]}
        />
      </div>

      {active.isLoading ? (
        <ProfileSkeleton rows={4} bare />
      ) : active.isError ? (
        <ProfileEmptyState bare icon={AlertTriangle} title="Tasks could not be loaded" description="Please refresh the page and try again." />
      ) : tasks.length === 0 ? (
        <ProfileEmptyState
          bare
          icon={CheckSquare}
          title={view === 'to-me' ? 'Nothing assigned to you' : 'You have not handed out any tasks'}
          description={showCompleted ? undefined : 'Completed tasks are hidden — switch on "Show completed" to see them.'}
        />
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((t: any) => {
            const overdue = isTaskOverdue(t);
            const who = view === 'to-me' ? t.creator_name : t.assignee_name;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => open(t.id)}
                  className={cn(
                    'group flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none',
                    t.status === 'completed' && 'opacity-60',
                  )}
                >
                  <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', overdue ? 'bg-destructive' : t.status === 'in_progress' ? 'bg-primary' : t.status === 'completed' ? 'bg-success' : 'bg-muted-foreground/40')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn('text-[13px] font-medium text-foreground', t.status === 'completed' && 'line-through decoration-muted-foreground/50')}>{t.title}</span>
                      {overdue && <StatusPill tone="danger"><AlertTriangle className="h-3 w-3" />Overdue</StatusPill>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{view === 'to-me' ? `From ${who}` : `To ${who}`}</span>
                      <span className={cn('inline-flex items-center gap-1', overdue && 'text-destructive')}>
                        <CalendarClock className="h-3 w-3" />{t.due_date ? `Due ${fmtDay(t.due_date)}` : 'No due date'}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    <TaskPriorityBadge priority={t.priority} />
                    <TaskStatusBadge status={t.status} />
                  </span>
                  <ChevronRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground sm:block" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <TaskDetailDialog taskId={selectedTaskId} open={detailOpen} onOpenChange={onDetailOpenChange} />
    </SectionBlock>
  );
}
