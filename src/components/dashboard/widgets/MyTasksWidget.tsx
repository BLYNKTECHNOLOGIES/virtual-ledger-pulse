import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMyTaskCounts, useTasks, type Task } from '@/hooks/useTasks';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { CheckSquare, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isPast } from 'date-fns';

export function MyTasksWidget() {
  const { data: counts } = useMyTaskCounts();
  const { data: tasks } = useTasks({ status: 'all', showCompleted: false });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const navigate = useNavigate();

  // Top 5 urgent tasks sorted by priority then due date
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const urgentTasks = [...(tasks || [])]
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return a.due_date ? -1 : 1;
    })
    .slice(0, 5);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckSquare className="h-4 w-4" /> My Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 text-center p-2 rounded bg-muted/50">
              <p className="text-lg font-bold">{counts?.open ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Open</p>
            </div>
            <div className="flex-1 text-center p-2 rounded bg-blue-50">
              <p className="text-lg font-bold text-blue-700">{counts?.in_progress ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">In Progress</p>
            </div>
            <div className="flex-1 text-center p-2 rounded bg-red-50">
              <p className="text-lg font-bold text-red-700">{counts?.overdue ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Overdue</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {urgentTasks.map(task => (
              <button
                key={task.id}
                className="w-full text-left flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                onClick={() => { setSelectedTaskId(task.id); setDetailOpen(true); }}
              >
                <TaskPriorityBadge priority={task.priority} />
                <span className="flex-1 truncate">{task.title}</span>
                {task.due_date && isPast(new Date(task.due_date)) && (
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                )}
                {task.due_date && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(task.due_date), 'MMM d')}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            className="w-full mt-2 text-xs text-primary flex items-center justify-center gap-1 hover:underline"
            onClick={() => navigate('/tasks')}
          >
            View all tasks <ArrowRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>

      <TaskDetailDialog taskId={selectedTaskId} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
