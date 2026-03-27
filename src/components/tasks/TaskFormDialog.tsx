import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateTask, useUsers } from '@/hooks/useTasks';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { TaskTemplateActions } from './TaskTemplateActions';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskFormDialog({ open, onOpenChange }: TaskFormDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('daily');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceTime, setRecurrenceTime] = useState('09:00');
  const [tags, setTags] = useState('');
  const [spectatorIds, setSpectatorIds] = useState<string[]>([]);
  const [reminderHours, setReminderHours] = useState('');

  const { data: users } = useUsers();
  const createTask = useCreateTask();
  const { toast } = useToast();

  const resetForm = () => {
    setTitle(''); setDescription(''); setPriority('medium'); setAssigneeId('');
    setDueDate(''); setDueTime(''); setIsRecurring(false); setRecurrenceType('daily');
    setRecurrenceDays([]); setRecurrenceTime('09:00'); setTags(''); setSpectatorIds([]);
    setReminderHours('');
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    const dueDatetime = dueDate ? `${dueDate}T${dueTime || '23:59'}:00` : undefined;

    try {
      await createTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignee_id: assigneeId || undefined,
        due_date: dueDatetime,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        is_recurring: isRecurring,
        recurrence_type: isRecurring ? recurrenceType : undefined,
        recurrence_days: isRecurring && recurrenceType === 'weekly' ? recurrenceDays : undefined,
        recurrence_time: isRecurring ? recurrenceTime : undefined,
        spectator_ids: spectatorIds.length ? spectatorIds : undefined,
        reminder_hours_before: reminderHours ? parseInt(reminderHours) : undefined,
      });
      toast({ title: 'Task created successfully' });
      resetForm();
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to create task', variant: 'destructive' });
    }
  };

  const toggleDay = (day: number) => {
    setRecurrenceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleSpectator = (userId: string) => {
    setSpectatorIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Create New Task</DialogTitle>
            <TaskTemplateActions
              currentTask={{ title, description, priority, tags }}
              onLoadTemplate={(t) => {
                setTitle(t.title);
                setDescription(t.description);
                setPriority(t.priority);
                setTags(t.tags.join(', '));
              }}
            />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Task description..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {(users || []).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Due Time</Label>
              <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Reminder (hours before due)</Label>
            <Input type="number" min="1" value={reminderHours} onChange={e => setReminderHours(e.target.value)} placeholder="e.g. 2, 6, 48" />
            <p className="text-xs text-muted-foreground mt-1">Get notified X hours before due date</p>
          </div>

          <div>
            <Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. urgent, finance" />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            <Label>Recurring Task</Label>
          </div>

          {isRecurring && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div>
                <Label>Recurrence</Label>
                <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recurrenceType === 'weekly' && (
                <div>
                  <Label>Days</Label>
                  <div className="flex gap-1 mt-1">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(i + 1)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          recurrenceDays.includes(i + 1) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Time</Label>
                <Input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label>Spectators</Label>
            <div className="max-h-32 overflow-y-auto border rounded-md mt-1">
              {(users || []).filter(u => u.id !== assigneeId).map(u => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={spectatorIds.includes(u.id)}
                    onChange={() => toggleSpectator(u.id)}
                    className="rounded"
                  />
                  {u.full_name || u.username}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createTask.isPending}>
            {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
