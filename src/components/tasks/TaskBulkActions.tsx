import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateTask, useUsers, type Task } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { X, UserPlus, RefreshCw, Loader2 } from 'lucide-react';

interface TaskBulkActionsProps {
  selectedTasks: Task[];
  onClearSelection: () => void;
}

export function TaskBulkActions({ selectedTasks, onClearSelection }: TaskBulkActionsProps) {
  const { data: users } = useUsers();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleBulkStatus = async (status: string) => {
    setLoading(true);
    try {
      for (const task of selectedTasks) {
        await updateTask.mutateAsync({ taskId: task.id, updates: { status }, oldTask: task });
      }
      toast({ title: `${selectedTasks.length} tasks updated to ${status.replace('_', ' ')}` });
      onClearSelection();
    } catch {
      toast({ title: 'Error updating tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReassign = async (assigneeId: string) => {
    setLoading(true);
    try {
      for (const task of selectedTasks) {
        await updateTask.mutateAsync({ taskId: task.id, updates: { assignee_id: assigneeId }, oldTask: task });
      }
      toast({ title: `${selectedTasks.length} tasks reassigned` });
      onClearSelection();
    } catch {
      toast({ title: 'Error reassigning tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!selectedTasks.length) return null;

  return (
    <div className="flex items-center gap-3 bg-muted/50 border rounded-lg px-4 py-2 flex-wrap">
      <span className="text-sm font-medium">{selectedTasks.length} selected</span>
      <Button size="sm" variant="ghost" onClick={onClearSelection}><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>

      <div className="h-4 w-px bg-border" />

      <Select onValueChange={handleBulkStatus} disabled={loading}>
        <SelectTrigger className="w-[150px] h-8 text-sm">
          <SelectValue placeholder="Change Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>

      <Select onValueChange={handleBulkReassign} disabled={loading}>
        <SelectTrigger className="w-[180px] h-8 text-sm">
          <SelectValue placeholder="Reassign to..." />
        </SelectTrigger>
        <SelectContent>
          {(users || []).map(u => (
            <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  );
}
