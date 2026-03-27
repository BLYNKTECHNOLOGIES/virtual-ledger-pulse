import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMyTaskCounts, useTasks, useUpdateTask, type Task } from '@/hooks/useTasks';
import { useAddTaskComment } from '@/hooks/useTaskComments';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { CheckSquare, AlertTriangle, ArrowRight, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isPast } from 'date-fns';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-muted text-foreground' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
];

export function MyTasksWidget() {
  const { data: counts } = useMyTaskCounts();
  const { data: tasks } = useTasks({ status: 'all', showCompleted: false });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const updateTask = useUpdateTask();
  const addComment = useAddTaskComment();

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

  const handleStatusChange = (task: Task, newStatus: string) => {
    updateTask.mutate(
      { taskId: task.id, updates: { status: newStatus }, oldTask: task },
      {
        onSuccess: () => toast.success(`Task status updated to ${newStatus.replace('_', ' ')}`),
        onError: () => toast.error('Failed to update status'),
      }
    );
  };

  const handleAddComment = (taskId: string) => {
    const text = commentText[taskId]?.trim();
    if (!text) return;
    addComment.mutate(
      { taskId, content: text },
      {
        onSuccess: () => {
          setCommentText(prev => ({ ...prev, [taskId]: '' }));
          toast.success('Comment added');
        },
        onError: () => toast.error('Failed to add comment'),
      }
    );
  };

  const toggleExpand = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTaskId(prev => prev === taskId ? null : taskId);
  };

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
              <div key={task.id} className="rounded border border-border p-2 space-y-1.5">
                {/* Task title row */}
                <div className="flex items-center gap-2 text-sm">
                  <TaskPriorityBadge priority={task.priority} />
                  <button
                    className="flex-1 text-left truncate"
                    onClick={() => { setSelectedTaskId(task.id); setDetailOpen(true); }}
                  >
                    {task.title}
                  </button>
                  {task.due_date && isPast(new Date(task.due_date)) && (
                    <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  {task.due_date && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(task.due_date), 'MMM d')}
                    </span>
                  )}
                </div>
                {/* Inline status + comment */}
                <div className="flex items-center gap-1.5">
                  <Select
                    value={task.status}
                    onValueChange={(val) => handleStatusChange(task, val)}
                  >
                    <SelectTrigger className="h-6 text-[10px] w-[90px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={commentText[task.id] || ''}
                    onChange={(e) => setCommentText(prev => ({ ...prev, [task.id]: e.target.value }))}
                    placeholder="Add a comment..."
                    className="h-6 text-[10px] flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(task.id); }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleAddComment(task.id)}
                    disabled={!commentText[task.id]?.trim() || addComment.isPending}
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              </div>
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
