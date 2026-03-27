import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskAssignmentChain } from './TaskAssignmentChain';
import { TaskComments } from './TaskComments';
import { TaskActivityLog } from './TaskActivityLog';
import { TaskAttachments } from './TaskAttachments';
import { useTaskDetail, useTaskAssignments, useTaskSpectators, useUpdateTask, useUsers, useAddSpectator, useRemoveSpectator, useTogglePin, useDuplicateTask, type Task } from '@/hooks/useTasks';
import { format, isPast, differenceInHours, differenceInMinutes } from 'date-fns';
import { Calendar, User, Users, Clock, AlertTriangle, X, Star, Copy, Timer, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface TaskDetailDialogProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ taskId, open, onOpenChange }: TaskDetailDialogProps) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const { data: assignments } = useTaskAssignments(taskId);
  const { data: spectators } = useTaskSpectators(taskId);
  const { data: allUsers } = useUsers();
  const updateTask = useUpdateTask();
  const addSpectator = useAddSpectator();
  const removeSpectator = useRemoveSpectator();
  const togglePin = useTogglePin();
  const duplicateTask = useDuplicateTask();
  const { toast } = useToast();
  const { user } = useAuth();
  const [spectatorToAdd, setSpectatorToAdd] = useState('');
  const [showEscalation, setShowEscalation] = useState(false);
  const [escHours, setEscHours] = useState('');
  const [escUserId, setEscUserId] = useState('');

  if (!taskId) return null;

  const handleStatusChange = async (status: string) => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({ taskId, updates: { status }, oldTask: task });
      toast({ title: `Status updated to ${status.replace('_', ' ')}` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleReassign = async (newAssigneeId: string) => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({ taskId, updates: { assignee_id: newAssigneeId }, oldTask: task });
      toast({ title: 'Task reassigned' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reassign', variant: 'destructive' });
    }
  };

  const handleAddSpectator = async () => {
    if (!spectatorToAdd || !taskId) return;
    try {
      await addSpectator.mutateAsync({ taskId, userId: spectatorToAdd });
      setSpectatorToAdd('');
      toast({ title: 'Spectator added' });
    } catch {
      toast({ title: 'Error', description: 'Failed to add spectator', variant: 'destructive' });
    }
  };

  const handleRemoveSpectator = async (userId: string) => {
    if (!taskId) return;
    try {
      await removeSpectator.mutateAsync({ taskId, userId });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove spectator', variant: 'destructive' });
    }
  };

  const handlePin = async () => {
    if (!task) return;
    try {
      await togglePin.mutateAsync({ taskId, currentlyPinned: !!task.is_pinned });
      toast({ title: task.is_pinned ? 'Task unpinned' : 'Task pinned' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleDuplicate = async () => {
    if (!task) return;
    try {
      await duplicateTask.mutateAsync(task);
      toast({ title: 'Task duplicated' });
    } catch {
      toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' });
    }
  };

  const handleSaveEscalation = async () => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({
        taskId,
        updates: {
          escalation_hours: escHours ? parseInt(escHours) : null,
          escalation_user_id: escUserId || null,
        },
        oldTask: task,
      });
      toast({ title: 'Escalation rule saved' });
      setShowEscalation(false);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const isOverdue = task?.due_date && task.status !== 'completed' && isPast(new Date(task.due_date));
  const isDueSoon = task?.due_date && task.status !== 'completed' && !isOverdue && differenceInHours(new Date(task.due_date), new Date()) <= 24;

  const existingSpectatorIds = new Set((spectators || []).map(s => s.user_id));
  const availableSpectators = (allUsers || []).filter(u => !existingSpectatorIds.has(u.id) && u.id !== task?.assignee_id);

  // SLA calculation
  const slaResponseTime = (() => {
    if (!task) return null;
    const assignmentTime = assignments?.[0]?.assigned_at || task.created_at;
    const responseTime = task.first_response_at;
    if (!responseTime) return task.status === 'open' ? 'Awaiting response' : null;
    const mins = differenceInMinutes(new Date(responseTime), new Date(assignmentTime));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{isLoading ? 'Loading...' : task?.title}</span>
            {task && <TaskPriorityBadge priority={task.priority} />}
            {task && <TaskStatusBadge status={task.status} />}
            {task?.is_pinned && (
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            )}
            {isOverdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </Badge>
            )}
            {isDueSoon && (
              <Badge variant="outline" className="gap-1 bg-orange-50 text-orange-700 border-orange-200">
                <Clock className="h-3 w-3" /> Due Soon
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {task && (
          <div className="space-y-4">
            {/* Quick actions row */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handlePin}>
                <Star className={`h-3.5 w-3.5 mr-1 ${task.is_pinned ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                {task.is_pinned ? 'Unpin' : 'Pin'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicate}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setShowEscalation(!showEscalation);
                setEscHours(task.escalation_hours?.toString() || '');
                setEscUserId(task.escalation_user_id || '');
              }}>
                <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Escalation
              </Button>
            </div>

            {/* SLA Info */}
            {slaResponseTime && (
              <div className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">SLA Response Time:</span>
                <span className="font-medium">{slaResponseTime}</span>
              </div>
            )}

            {/* Escalation Config */}
            {showEscalation && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <h4 className="text-sm font-medium flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" /> Escalation Rule
                </h4>
                <p className="text-xs text-muted-foreground">Auto-notify or reassign if task stays overdue for X hours</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Escalate after (hours)</Label>
                    <Input type="number" value={escHours} onChange={e => setEscHours(e.target.value)} placeholder="e.g. 24" className="h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">Escalate to</Label>
                    <Select value={escUserId} onValueChange={setEscUserId}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select manager" /></SelectTrigger>
                      <SelectContent>
                        {(allUsers || []).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEscalation}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowEscalation(false)}>Cancel</Button>
                </div>
                {task.escalation_hours && (
                  <p className="text-xs text-muted-foreground">
                    Current: Escalate after {task.escalation_hours}h
                    {task.escalation_user_id && ` to ${(allUsers || []).find(u => u.id === task.escalation_user_id)?.full_name || 'user'}`}
                  </p>
                )}
              </div>
            )}

            {/* Description */}
            {task.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            )}

            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created by:</span>
                <span className="font-medium">{task.creator_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Due:</span>
                <span className="font-medium">{task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy h:mm a') : 'No due date'}</span>
              </div>
            </div>

            {/* Tags */}
            {task.tags?.length ? (
              <div className="flex gap-1 flex-wrap">
                {task.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                <Select value={task.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Reassign</label>
                <Select value={task.assignee_id || ''} onValueChange={handleReassign}>
                  <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {(allUsers || []).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Assignment Chain */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Users className="h-4 w-4" /> Assignment Chain
              </h4>
              <TaskAssignmentChain assignments={assignments || []} creatorName={task.creator_name} />
            </div>

            <Separator />

            {/* Spectators */}
            <div>
              <h4 className="text-sm font-medium mb-2">Spectators</h4>
              <div className="flex flex-wrap gap-1 mb-2">
                {(spectators || []).map(s => (
                  <Badge key={s.id} variant="secondary" className="gap-1">
                    {s.user_name}
                    <button onClick={() => handleRemoveSpectator(s.user_id)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {!spectators?.length && <span className="text-sm text-muted-foreground">None</span>}
              </div>
              <div className="flex gap-2">
                <Select value={spectatorToAdd} onValueChange={setSpectatorToAdd}>
                  <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="Add spectator" /></SelectTrigger>
                  <SelectContent>
                    {availableSpectators.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={handleAddSpectator} disabled={!spectatorToAdd}>Add</Button>
              </div>
            </div>

            <Separator />

            {/* Attachments */}
            <TaskAttachments taskId={taskId} />

            <Separator />

            {/* Comments & Activity */}
            <Tabs defaultValue="comments">
              <TabsList className="w-full">
                <TabsTrigger value="comments" className="flex-1">Comments</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">Activity Log</TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="mt-3">
                <TaskComments taskId={taskId} />
              </TabsContent>
              <TabsContent value="activity" className="mt-3">
                <TaskActivityLog taskId={taskId} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
