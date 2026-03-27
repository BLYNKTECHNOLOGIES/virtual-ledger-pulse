import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskDetailDialog } from './TaskDetailDialog';
import { format, isPast } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, AlertTriangle } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

async function fetchUserMap(userIds: Set<string>) {
  if (!userIds.size) return {};
  const { data } = await from('users').select('id, full_name, username').in('id', Array.from(userIds));
  const map: Record<string, string> = {};
  ((data as any[]) || []).forEach((u: any) => { map[u.id] = u.full_name || u.username || 'Unknown'; });
  return map;
}

export function UserProfileTasks() {
  const { user } = useAuth();
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: assignedToMe = [] } = useQuery({
    queryKey: ['profile-tasks-to-me', user?.id, showCompleted],
    queryFn: async () => {
      if (!user?.id) return [];
      let q = from('erp_tasks').select('*').eq('assignee_id', user.id).order('created_at', { ascending: false });
      if (!showCompleted) q = q.neq('status', 'completed');
      const { data, error } = await q;
      if (error) throw error;
      const tasks = (data as any[]) || [];
      const ids = new Set<string>();
      tasks.forEach(t => { if (t.created_by) ids.add(t.created_by); });
      const map = await fetchUserMap(ids);
      return tasks.map(t => ({ ...t, creator_name: map[t.created_by] || 'Unknown' }));
    },
    enabled: !!user?.id,
  });

  const { data: assignedByMe = [] } = useQuery({
    queryKey: ['profile-tasks-by-me', user?.id, showCompleted],
    queryFn: async () => {
      if (!user?.id) return [];
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

  const renderTable = (tasks: any[], showColumn: 'creator' | 'assignee') => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>{showColumn === 'creator' ? 'Created By' : 'Assignee'}</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!tasks.length && (
          <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tasks</TableCell></TableRow>
        )}
        {tasks.map((t: any) => {
          const overdue = t.due_date && t.status !== 'completed' && isPast(new Date(t.due_date));
          return (
            <TableRow key={t.id} className={`cursor-pointer ${t.status === 'completed' ? 'opacity-50' : ''}`}
              onClick={() => { setSelectedTaskId(t.id); setDetailOpen(true); }}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.title}</span>
                  {overdue && <Badge variant="destructive" className="text-[10px] px-1.5 py-0"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Overdue</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-sm">{showColumn === 'creator' ? t.creator_name : t.assignee_name}</TableCell>
              <TableCell><TaskPriorityBadge priority={t.priority} /></TableCell>
              <TableCell className="text-sm">{t.due_date ? format(new Date(t.due_date), 'MMM d, yyyy') : '—'}</TableCell>
              <TableCell><TaskStatusBadge status={t.status} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" /> My Tasks</CardTitle>
          <div className="flex items-center gap-2">
            <Switch id="profile-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="profile-completed" className="text-sm">Show Completed</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="assigned-to-me">
          <TabsList className="mx-4 mb-2">
            <TabsTrigger value="assigned-to-me">Assigned to Me ({assignedToMe.length})</TabsTrigger>
            <TabsTrigger value="assigned-by-me">Assigned by Me ({assignedByMe.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="assigned-to-me">{renderTable(assignedToMe, 'creator')}</TabsContent>
          <TabsContent value="assigned-by-me">{renderTable(assignedByMe, 'assignee')}</TabsContent>
        </Tabs>
      </CardContent>
      <TaskDetailDialog taskId={selectedTaskId} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  );
}
