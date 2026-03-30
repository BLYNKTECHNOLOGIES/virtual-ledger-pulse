import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sendTaskEmail } from '@/utils/taskEmail';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string | null;
  assignee_id: string | null;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_type: string | null;
  recurrence_days: number[] | null;
  recurrence_time: string | null;
  parent_task_id: string | null;
  completed_at: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
  first_response_at?: string | null;
  escalation_hours?: number | null;
  escalation_user_id?: string | null;
  reminder_hours_before?: number | null;
  creator_name?: string;
  assignee_name?: string;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  assigned_at: string;
  from_user_name?: string;
  to_user_name?: string;
}

export interface TaskSpectator {
  id: string;
  task_id: string;
  user_id: string;
  added_by: string | null;
  added_at: string;
  user_name?: string;
}

// Helper to query untyped tables
const from = (table: string) => supabase.from(table as any);

async function fetchUserMap(userIds: Set<string>): Promise<Record<string, string>> {
  if (userIds.size === 0) return {};
  const { data } = await from('users')
    .select('id, first_name, last_name, username')
    .in('id', Array.from(userIds));
  const map: Record<string, string> = {};
  ((data as any[]) || []).forEach((u: any) => {
    map[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown';
  });
  return map;
}

export function useTasks(filters?: {
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  showCompleted?: boolean;
  overdue?: boolean;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['erp-tasks', filters],
    queryFn: async () => {
      let query = from('erp_tasks').select('*').order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (!filters?.showCompleted) {
        query = query.neq('status', 'completed');
      }
      if (filters?.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.assigneeId && filters.assigneeId !== 'all') {
        query = query.eq('assignee_id', filters.assigneeId);
      }
      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`);
      }
      if (filters?.overdue) {
        query = query.lt('due_date', new Date().toISOString()).neq('status', 'completed');
      }

      const { data, error } = await query;
      if (error) throw error;

      const tasks = ((data as any[]) || []) as any[];
      const userIds = new Set<string>();
      tasks.forEach(t => {
        if (t.created_by) userIds.add(t.created_by);
        if (t.assignee_id) userIds.add(t.assignee_id);
      });
      const userMap = await fetchUserMap(userIds);

      // Visibility filter
      const isAdmin = user?.roles?.some((r: string) =>
        r.toLowerCase() === 'admin' || r.toLowerCase() === 'super admin'
      );

      let spectatorTaskIds: Set<string> = new Set();
      if (user?.id && !isAdmin) {
        const { data: specs } = await from('erp_task_spectators')
          .select('task_id')
          .eq('user_id', user.id);
        ((specs as any[]) || []).forEach((s: any) => spectatorTaskIds.add(s.task_id));
      }

      const filtered = tasks.filter((t: any) => {
        if (isAdmin) return true;
        if (t.created_by === user?.id) return true;
        if (t.assignee_id === user?.id) return true;
        if (spectatorTaskIds.has(t.id)) return true;
        return false;
      });

      return filtered.map((t: any) => ({
        ...t,
        creator_name: userMap[t.created_by] || 'Unknown',
        assignee_name: t.assignee_id ? (userMap[t.assignee_id] || 'Unknown') : 'Unassigned',
      })) as Task[];
    },
    enabled: !!user,
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ['erp-task-detail', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const { data, error } = await from('erp_tasks').select('*').eq('id', taskId).single();
      if (error) throw error;
      const d = data as any;

      const userIds = new Set<string>();
      if (d.created_by) userIds.add(d.created_by);
      if (d.assignee_id) userIds.add(d.assignee_id);
      if (d.escalation_user_id) userIds.add(d.escalation_user_id);
      const userMap = await fetchUserMap(userIds);

      return {
        ...d,
        creator_name: userMap[d.created_by] || 'Unknown',
        assignee_name: d.assignee_id ? (userMap[d.assignee_id] || 'Unknown') : 'Unassigned',
      } as Task;
    },
    enabled: !!taskId,
  });
}

export function useTaskAssignments(taskId: string | null) {
  return useQuery({
    queryKey: ['erp-task-assignments', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await from('erp_task_assignments')
        .select('*').eq('task_id', taskId).order('assigned_at', { ascending: true });
      if (error) throw error;

      const items = (data as any[]) || [];
      const userIds = new Set<string>();
      items.forEach((a: any) => {
        if (a.from_user_id) userIds.add(a.from_user_id);
        if (a.to_user_id) userIds.add(a.to_user_id);
      });
      const userMap = await fetchUserMap(userIds);

      return items.map((a: any) => ({
        ...a,
        from_user_name: a.from_user_id ? (userMap[a.from_user_id] || 'Unknown') : 'System',
        to_user_name: a.to_user_id ? (userMap[a.to_user_id] || 'Unknown') : 'Unknown',
      })) as TaskAssignment[];
    },
    enabled: !!taskId,
  });
}

export function useTaskSpectators(taskId: string | null) {
  return useQuery({
    queryKey: ['erp-task-spectators', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await from('erp_task_spectators').select('*').eq('task_id', taskId);
      if (error) throw error;

      const items = (data as any[]) || [];
      const userIds = new Set<string>();
      items.forEach((s: any) => { if (s.user_id) userIds.add(s.user_id); });
      const userMap = await fetchUserMap(userIds);

      return items.map((s: any) => ({
        ...s,
        user_name: userMap[s.user_id] || 'Unknown',
      })) as TaskSpectator[];
    },
    enabled: !!taskId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      priority?: string;
      assignee_id?: string;
      due_date?: string;
      tags?: string[];
      is_recurring?: boolean;
      recurrence_type?: string;
      recurrence_days?: number[];
      recurrence_time?: string;
      spectator_ids?: string[];
      escalation_hours?: number;
      escalation_user_id?: string;
      reminder_hours_before?: number;
    }) => {
      const { spectator_ids, ...taskData } = task;
      const { data, error } = await from('erp_tasks')
        .insert({ ...taskData, created_by: user?.id })
        .select().single();
      if (error) throw error;
      const d = data as any;

      if (task.assignee_id) {
        await from('erp_task_assignments').insert({
          task_id: d.id, from_user_id: user?.id, to_user_id: task.assignee_id,
        });
      }

      if (spectator_ids?.length) {
        await from('erp_task_spectators').insert(
          spectator_ids.map(uid => ({ task_id: d.id, user_id: uid, added_by: user?.id }))
        );
      }

      await from('erp_task_activity_log').insert({
        task_id: d.id, user_id: user?.id, action: 'task_created',
        details: { title: task.title, assignee_id: task.assignee_id },
      });

      if (task.assignee_id) {
        if (task.assignee_id !== user?.id) {
          await from('terminal_notifications').insert({
            user_id: task.assignee_id,
            title: 'New Task Assigned',
            message: `You have been assigned: "${task.title}"`,
            notification_type: 'task_assigned',
          });
        }

        const creatorName =
          [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
          user?.username ||
          'Someone';
        const { data: assigneeData } = await from('users')
          .select('email, first_name, last_name, username')
          .eq('id', task.assignee_id)
          .single();
        const assignee = assigneeData as any;

        if (assignee?.email) {
          // Only send to assignee — creator should NOT receive the assigned email
          sendTaskEmail({
            eventType: 'task_assigned',
            taskId: d.id,
            taskTitle: task.title,
            taskDescription: task.description,
            assignedByName: creatorName,
            dueDate: task.due_date,
            status: 'open',
            recipientEmail: assignee.email,
            recipientName:
              [assignee.first_name, assignee.last_name].filter(Boolean).join(' ') || assignee.username,
            recipientUserId: task.assignee_id,
            ccUserIds: [],
          });
        }

        // Send spectator notifications
        if (spectator_ids?.length) {
          const assigneeName =
            [assignee?.first_name, assignee?.last_name].filter(Boolean).join(' ') || assignee?.username || 'Someone';

          const { data: spectatorUsersData } = await from('users')
            .select('id, email, first_name, last_name, username')
            .in('id', spectator_ids);
          const spectatorUsers = (spectatorUsersData || []) as any[];

          if (spectatorUsers.length) {
            for (const spec of spectatorUsers) {
              if (!spec.email) continue;
              const specName = [spec.first_name, spec.last_name].filter(Boolean).join(' ') || spec.username;
              const today = new Date().toISOString().split('T')[0];

              supabase.functions.invoke('send-transactional-email', {
                body: {
                  templateName: 'task-spectator-notification',
                  recipientEmail: spec.email,
                  idempotencyKey: `task-spectator-${d.id}-${spec.email}-${today}`,
                  templateData: {
                    taskTitle: task.title,
                    taskDescription: task.description,
                    assignedToName: assigneeName,
                    assignedByName: creatorName,
                    dueDate: task.due_date,
                    status: 'open',
                    recipientName: specName,
                  },
                },
              }).catch((err) => { console.warn('Task email notify failed (non-blocking):', err); });
            }
          }
        }
      }

      return d;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erp-tasks'] }); },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, updates, oldTask }: {
      taskId: string;
      updates: Partial<{
        title: string; description: string; status: string; priority: string;
        assignee_id: string; due_date: string; tags: string[]; completed_at: string;
        is_pinned: boolean; pinned_at: string | null;
        escalation_hours: number | null; escalation_user_id: string | null;
      }>;
      oldTask?: Task;
    }) => {
      if (updates.status === 'completed' && !updates.completed_at) {
        updates.completed_at = new Date().toISOString();
      }

      // SLA: track first_response_at when status changes from 'open' for the first time
      const extraUpdates: any = {};
      if (updates.status && updates.status !== 'open' && oldTask?.status === 'open' && !oldTask?.first_response_at) {
        extraUpdates.first_response_at = new Date().toISOString();
      }

      const { error } = await from('erp_tasks').update({ ...updates, ...extraUpdates }).eq('id', taskId);
      if (error) throw error;

      const activities: any[] = [];

      if (updates.status && oldTask?.status !== updates.status) {
        activities.push({ task_id: taskId, user_id: user?.id, action: 'status_changed', details: { from: oldTask?.status, to: updates.status } });

        // On completion: send email to creator + spectators, NOT assignee
        if (updates.status === 'completed' && oldTask) {
          const completedByName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Someone';
          const completedAt = updates.completed_at || new Date().toISOString();
          const today = new Date().toISOString().split('T')[0];

          // Collect recipients: creator + spectators (exclude assignee)
          const recipientIds: string[] = [];
          if (oldTask.created_by && oldTask.created_by !== oldTask.assignee_id) {
            recipientIds.push(oldTask.created_by);
          }

          const { data: specData } = await from('erp_task_spectators')
            .select('user_id')
            .eq('task_id', taskId);
          const spectatorIds = (specData || []).map((s: any) => s.user_id).filter((id: string) => id !== oldTask.assignee_id);
          recipientIds.push(...spectatorIds);

          const uniqueIds = [...new Set(recipientIds)];
          if (uniqueIds.length) {
            const { data: recipientUsersData } = await from('users')
              .select('id, email, first_name, last_name, username')
              .in('id', uniqueIds);
            const recipientUsers = (recipientUsersData || []) as any[];

            for (const ru of recipientUsers) {
              if (!ru.email) continue;
              const ruName = [ru.first_name, ru.last_name].filter(Boolean).join(' ') || ru.username;
              const isSpectator = spectatorIds.includes(ru.id);

              supabase.functions.invoke('send-transactional-email', {
                body: {
                  templateName: 'task-completed',
                  recipientEmail: ru.email,
                  idempotencyKey: `task-completed-${taskId}-${ru.email}-${today}`,
                  templateData: {
                    taskTitle: oldTask.title,
                    taskDescription: oldTask.description,
                    completedByName,
                    dueDate: oldTask.due_date,
                    completedAt,
                    recipientName: ruName,
                    recipientRole: isSpectator ? 'spectator' : 'creator',
                  },
                },
              }).catch(() => {});
            }
          }
        }
      }
      if (updates.priority && oldTask?.priority !== updates.priority) {
        activities.push({ task_id: taskId, user_id: user?.id, action: 'priority_changed', details: { from: oldTask?.priority, to: updates.priority } });
      }
      if (updates.assignee_id && oldTask?.assignee_id !== updates.assignee_id) {
        await from('erp_task_assignments').insert({
          task_id: taskId, from_user_id: oldTask?.assignee_id || user?.id, to_user_id: updates.assignee_id,
        });
        activities.push({ task_id: taskId, user_id: user?.id, action: 'reassigned', details: { from: oldTask?.assignee_id, to: updates.assignee_id } });
        if (updates.assignee_id !== user?.id) {
          await from('terminal_notifications').insert({
            user_id: updates.assignee_id, title: 'Task Reassigned to You',
            message: `Task "${oldTask?.title || ''}" has been reassigned to you`, notification_type: 'task_reassigned',
          });
        }

        const reassignerName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Someone';
        const { data: reassigneeData } = await from('users')
          .select('email, first_name, last_name, username')
          .eq('id', updates.assignee_id)
          .single();
        const reassignee = reassigneeData as any;
        if (reassignee?.email) {
          sendTaskEmail({
            eventType: 'task_reassigned',
            taskId: taskId,
            taskTitle: oldTask?.title || '',
            taskDescription: oldTask?.description || undefined,
            assignedByName: reassignerName,
            dueDate: oldTask?.due_date || updates.due_date,
            status: updates.status || oldTask?.status,
            recipientEmail: reassignee.email,
            recipientName: [reassignee.first_name, reassignee.last_name].filter(Boolean).join(' ') || reassignee.username,
            recipientUserId: updates.assignee_id,
          });
        }
      }
      if (updates.due_date && oldTask?.due_date !== updates.due_date) {
        activities.push({ task_id: taskId, user_id: user?.id, action: 'due_date_changed', details: { from: oldTask?.due_date, to: updates.due_date } });
      }

      if (activities.length > 0) {
        await from('erp_task_activity_log').insert(activities);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['erp-task-detail'] });
      queryClient.invalidateQueries({ queryKey: ['erp-task-assignments'] });
    },
  });
}

export function useTogglePin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, currentlyPinned }: { taskId: string; currentlyPinned: boolean }) => {
      const { error } = await from('erp_tasks').update({
        is_pinned: !currentlyPinned,
        pinned_at: !currentlyPinned ? new Date().toISOString() : null,
      }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['erp-task-detail'] });
    },
  });
}

export function useDuplicateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (sourceTask: Task) => {
      const { data, error } = await from('erp_tasks')
        .insert({
          title: `${sourceTask.title} (Copy)`,
          description: sourceTask.description,
          priority: sourceTask.priority,
          assignee_id: sourceTask.assignee_id,
          due_date: sourceTask.due_date,
          tags: sourceTask.tags,
          created_by: user?.id,
          status: 'open',
          escalation_hours: sourceTask.escalation_hours,
          escalation_user_id: sourceTask.escalation_user_id,
        })
        .select().single();
      if (error) throw error;
      const d = data as any;

      if (sourceTask.assignee_id) {
        await from('erp_task_assignments').insert({
          task_id: d.id, from_user_id: user?.id, to_user_id: sourceTask.assignee_id,
        });
      }

      await from('erp_task_activity_log').insert({
        task_id: d.id, user_id: user?.id, action: 'task_created',
        details: { title: d.title, duplicated_from: sourceTask.id },
      });

      return d;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erp-tasks'] }); },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await from('erp_tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erp-tasks'] }); },
  });
}

export function useAddSpectator() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { error } = await from('erp_task_spectators').insert({ task_id: taskId, user_id: userId, added_by: user?.id });
      if (error) throw error;

      await from('erp_task_activity_log').insert({ task_id: taskId, user_id: user?.id, action: 'spectator_added', details: { spectator_id: userId } });

      if (userId !== user?.id) {
        await from('terminal_notifications').insert({
          user_id: userId, title: 'Added as Spectator',
          message: 'You have been added as a spectator to a task', notification_type: 'task_spectator_added',
        });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erp-task-spectators'] }); },
  });
}

export function useRemoveSpectator() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      const { error } = await from('erp_task_spectators').delete().eq('task_id', taskId).eq('user_id', userId);
      if (error) throw error;
      await from('erp_task_activity_log').insert({ task_id: taskId, user_id: user?.id, action: 'spectator_removed', details: { spectator_id: userId } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erp-task-spectators'] }); },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['erp-all-users'],
    queryFn: async () => {
      const { data, error } = await from('users')
        .select('id, first_name, last_name, username, email')
        .neq('status', 'inactive')
        .order('first_name');
      if (error) throw error;
      return ((data as any[]) || []).map((u: any) => ({
        id: u.id,
        full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
        username: u.username,
        email: u.email,
      }));
    },
  });
}

export function useMyTaskCounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['erp-task-counts', user?.id],
    queryFn: async () => {
      if (!user?.id) return { open: 0, in_progress: 0, overdue: 0 };
      const { data, error } = await from('erp_tasks')
        .select('status, due_date')
        .eq('assignee_id', user.id)
        .neq('status', 'completed');
      if (error) throw error;

      const now = new Date().toISOString();
      let open = 0, in_progress = 0, overdue = 0;
      ((data as any[]) || []).forEach((t: any) => {
        if (t.status === 'open') open++;
        if (t.status === 'in_progress') in_progress++;
        if (t.due_date && t.due_date < now) overdue++;
      });
      return { open, in_progress, overdue };
    },
    enabled: !!user?.id,
  });
}
