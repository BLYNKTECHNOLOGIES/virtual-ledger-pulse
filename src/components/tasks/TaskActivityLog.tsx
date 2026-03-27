import { useTaskActivity } from '@/hooks/useTaskActivity';
import { format } from 'date-fns';
import { Activity, ArrowRight, MessageSquare, User, Calendar, Flag, Eye, EyeOff, CheckCircle } from 'lucide-react';

const actionIcons: Record<string, any> = {
  task_created: CheckCircle,
  status_changed: Activity,
  priority_changed: Flag,
  reassigned: ArrowRight,
  due_date_changed: Calendar,
  comment_added: MessageSquare,
  spectator_added: Eye,
  spectator_removed: EyeOff,
};

const actionLabels: Record<string, (details: any) => string> = {
  task_created: () => 'created this task',
  status_changed: (d) => `changed status from ${d?.from || '?'} to ${d?.to || '?'}`,
  priority_changed: (d) => `changed priority from ${d?.from || '?'} to ${d?.to || '?'}`,
  reassigned: () => 'reassigned this task',
  due_date_changed: () => 'changed the due date',
  comment_added: () => 'added a comment',
  spectator_added: () => 'added a spectator',
  spectator_removed: () => 'removed a spectator',
};

export function TaskActivityLog({ taskId }: { taskId: string }) {
  const { data: activities, isLoading } = useTaskActivity(taskId);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading activity...</p>;
  if (!activities?.length) return <p className="text-sm text-muted-foreground py-4">No activity yet</p>;

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const Icon = actionIcons[activity.action] || Activity;
        const label = actionLabels[activity.action]?.(activity.details) || activity.action;

        return (
          <div key={activity.id} className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 p-1 rounded bg-muted">
              <Icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p>
                <span className="font-medium">{activity.user_name}</span>{' '}
                <span className="text-muted-foreground">{label}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
