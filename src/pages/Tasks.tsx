import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { TaskBulkActions } from '@/components/tasks/TaskBulkActions';
import { useTasks, useTogglePin, useUpdateTask, type Task } from '@/hooks/useTasks';
import { format, isPast, differenceInHours } from 'date-fns';
import { Plus, AlertTriangle, Clock, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Star, Bell } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';

type SortField = 'due_date' | 'priority' | null;
type SortDir = 'asc' | 'desc';

const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: tasks, isLoading } = useTasks({ search, status, priority, showCompleted, overdue });
  const togglePin = useTogglePin();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleInlineStatusChange = async (task: Task, newStatus: string) => {
    try {
      await updateTask.mutateAsync({ taskId: task.id, updates: { status: newStatus }, oldTask: task });
      toast({ title: `Status updated to ${newStatus.replace('_', ' ')}` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleNudge = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (!task.assignee_id) return;
    try {
      const from = (table: string) => supabase.from(table as any);

      // Check 30-minute cooldown for this task
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentNudge } = await from('erp_task_activity_log')
        .select('created_at')
        .eq('task_id', task.id)
        .eq('action', 'nudge_sent')
        .gte('created_at', thirtyMinAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentNudge && recentNudge.length > 0) {
        const lastNudgeTime = new Date(recentNudge[0].created_at);
        const minutesLeft = Math.ceil((30 * 60 * 1000 - (Date.now() - lastNudgeTime.getTime())) / 60000);
        toast({ title: 'Cooldown active', description: `Nudge already sent for this task. Try again in ${minutesLeft} min.`, variant: 'destructive' });
        return;
      }

      // In-app notification
      await from('terminal_notifications').insert({
        user_id: task.assignee_id,
        title: '🔔 Task Reminder',
        message: `Nudge: "${task.title}" needs your attention`,
        notification_type: 'task_nudge',
      });
      await from('erp_task_activity_log').insert({
        task_id: task.id, user_id: user?.id, action: 'nudge_sent',
        details: { nudged_user: task.assignee_id },
      });

      // Send email notification
      const senderName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.username || user?.email || 'System';
      
      await supabase.functions.invoke('send-task-email', {
        body: {
          eventType: 'task_nudge',
          taskId: task.id,
          taskTitle: task.title,
          taskDescription: task.description,
          assignedByName: senderName,
          dueDate: task.due_date,
          status: task.status,
          recipientUserIds: [task.assignee_id],
        },
      });

      toast({ title: 'Nudge sent to assignee' });
    } catch {
      toast({ title: 'Error', description: 'Failed to send nudge', variant: 'destructive' });
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTasks = (() => {
    if (!tasks) return [];
    let sorted = [...tasks];

    // Sort by field if set
    if (sortField) {
      sorted.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'due_date') {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          cmp = da - db;
        } else if (sortField === 'priority') {
          cmp = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    // Pinned tasks always on top
    sorted.sort((a, b) => {
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      return bPin - aPin;
    });

    return sorted;
  })();

  const openDetail = (taskId: string) => { setSelectedTaskId(taskId); setDetailOpen(true); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === sortedTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTasks.map(t => t.id)));
    }
  };

  const handleTogglePin = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    togglePin.mutate({ taskId: task.id, currentlyPinned: !!task.is_pinned });
  };

  const selectedTasks = sortedTasks.filter(t => selectedIds.has(t.id));

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Task Management</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Task
        </Button>
      </div>

      <TaskBulkActions selectedTasks={selectedTasks} onClearSelection={() => setSelectedIds(new Set())} />

      <Card>
        <CardHeader className="pb-3">
          <TaskFilters
            search={search} onSearchChange={setSearch}
            status={status} onStatusChange={setStatus}
            priority={priority} onPriorityChange={setPriority}
            showCompleted={showCompleted} onShowCompletedChange={setShowCompleted}
            overdue={overdue} onOverdueChange={setOverdue}
          />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !sortedTasks.length ? (
            <div className="text-center py-12 text-muted-foreground">No tasks found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === sortedTasks.length && sortedTasks.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>
                    <button className="flex items-center hover:text-foreground transition-colors" onClick={() => toggleSort('priority')}>
                      Priority <SortIcon field="priority" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center hover:text-foreground transition-colors" onClick={() => toggleSort('due_date')}>
                      Due Date <SortIcon field="due_date" />
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTasks.map(task => {
                  const isTaskOverdue = task.due_date && task.status !== 'completed' && isPast(new Date(task.due_date));
                  const isDueSoon = task.due_date && task.status !== 'completed' && !isTaskOverdue && differenceInHours(new Date(task.due_date), new Date()) <= 24;

                  return (
                    <TableRow
                      key={task.id}
                      className={`cursor-pointer ${task.status === 'completed' ? 'opacity-50' : ''} ${task.is_pinned ? 'bg-yellow-50/50 dark:bg-yellow-950/10' : ''}`}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
                      </TableCell>
                      <TableCell onClick={e => handleTogglePin(e, task)} className="px-1">
                        <button className="p-1 rounded hover:bg-muted transition-colors" title={task.is_pinned ? 'Unpin' : 'Pin'}>
                          <Star className={`h-4 w-4 ${task.is_pinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40 hover:text-muted-foreground'}`} />
                        </button>
                      </TableCell>
                      <TableCell onClick={() => openDetail(task.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{task.title}</span>
                          {isTaskOverdue && (
                            <Badge variant="destructive" className="gap-0.5 text-[10px] px-1.5 py-0">
                              <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                            </Badge>
                          )}
                          {isDueSoon && (
                            <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200">
                              <Clock className="h-2.5 w-2.5" /> Due Soon
                            </Badge>
                          )}
                        </div>
                        {task.tags?.length ? (
                          <div className="flex gap-1 mt-1">
                            {task.tags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell onClick={() => openDetail(task.id)} className="text-sm">{task.assignee_name}</TableCell>
                      <TableCell onClick={() => openDetail(task.id)}><TaskPriorityBadge priority={task.priority} /></TableCell>
                      <TableCell onClick={() => openDetail(task.id)} className="text-sm">
                        {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Select value={task.status} onValueChange={(val) => handleInlineStatusChange(task, val)}>
                          <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent hover:bg-muted">
                            <TaskStatusBadge status={task.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()} className="px-1">
                        <button
                          onClick={e => handleNudge(e, task)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Nudge assignee"
                          disabled={!task.assignee_id || task.assignee_id === user?.id}
                        >
                          <Bell className="h-4 w-4 text-muted-foreground/60 hover:text-muted-foreground" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TaskDetailDialog taskId={selectedTaskId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
