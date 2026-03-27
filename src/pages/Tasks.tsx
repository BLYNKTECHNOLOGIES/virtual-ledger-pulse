import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { TaskPriorityBadge } from '@/components/tasks/TaskPriorityBadge';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { useTasks } from '@/hooks/useTasks';
import { format, isPast, differenceInHours } from 'date-fns';
import { Plus, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: tasks, isLoading } = useTasks({
    search, status, priority, showCompleted, overdue,
  });

  const openDetail = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDetailOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Task Management</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Task
        </Button>
      </div>

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
          ) : !tasks?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              No tasks found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map(task => {
                  const isTaskOverdue = task.due_date && task.status !== 'completed' && isPast(new Date(task.due_date));
                  const isDueSoon = task.due_date && task.status !== 'completed' && !isTaskOverdue && differenceInHours(new Date(task.due_date), new Date()) <= 24;

                  return (
                    <TableRow
                      key={task.id}
                      className={`cursor-pointer ${task.status === 'completed' ? 'opacity-50' : ''}`}
                      onClick={() => openDetail(task.id)}
                    >
                      <TableCell>
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
                      <TableCell className="text-sm">{task.assignee_name}</TableCell>
                      <TableCell><TaskPriorityBadge priority={task.priority} /></TableCell>
                      <TableCell className="text-sm">
                        {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell><TaskStatusBadge status={task.status} /></TableCell>
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
