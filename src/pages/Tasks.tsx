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
import { useTasks, type Task } from '@/hooks/useTasks';
import { format, isPast, differenceInHours } from 'date-fns';
import { Plus, AlertTriangle, Clock, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTasks = (() => {
    if (!tasks || !sortField) return tasks || [];
    return [...tasks].sort((a, b) => {
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTasks.map(task => {
                  const isTaskOverdue = task.due_date && task.status !== 'completed' && isPast(new Date(task.due_date));
                  const isDueSoon = task.due_date && task.status !== 'completed' && !isTaskOverdue && differenceInHours(new Date(task.due_date), new Date()) <= 24;

                  return (
                    <TableRow
                      key={task.id}
                      className={`cursor-pointer ${task.status === 'completed' ? 'opacity-50' : ''}`}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
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
                      <TableCell onClick={() => openDetail(task.id)}><TaskStatusBadge status={task.status} /></TableCell>
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
