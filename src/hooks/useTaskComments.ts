import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string | null;
  content: string;
  mentions: string[] | null;
  created_at: string;
  user_name?: string;
  user_username?: string;
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['erp-task-comments', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('erp_task_comments' as any)
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = new Set<string>();
      (data || []).forEach((c: any) => { if (c.user_id) userIds.add(c.user_id); });

      let userMap: Record<string, { name: string; username: string }> = {};
      if (userIds.size > 0) {
        const { data: users } = await supabase
          .from('users' as any)
          .select('id, full_name, username')
          .in('id', Array.from(userIds));
        (users || []).forEach((u: any) => {
          userMap[u.id] = { name: u.full_name || u.username || 'Unknown', username: u.username || '' };
        });
      }

      return (data || []).map((c: any) => ({
        ...c,
        user_name: userMap[c.user_id]?.name || 'Unknown',
        user_username: userMap[c.user_id]?.username || '',
      })) as TaskComment[];
    },
    enabled: !!taskId,
  });
}

export function useAddTaskComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, content, mentions }: { taskId: string; content: string; mentions?: string[] }) => {
      const { error } = await supabase
        .from('erp_task_comments' as any)
        .insert({
          task_id: taskId,
          user_id: user?.id,
          content,
          mentions: mentions || [],
        });
      if (error) throw error;

      // Activity log
      await supabase.from('erp_task_activity_log' as any).insert({
        task_id: taskId,
        user_id: user?.id,
        action: 'comment_added',
        details: { content_preview: content.substring(0, 100) },
      });

      // Notify mentioned users
      if (mentions?.length) {
        const mentionedOthers = mentions.filter(uid => uid !== user?.id);
        const notifications = mentionedOthers.map(uid => ({
            user_id: uid,
            title: 'Mentioned in Task Comment',
            message: `You were mentioned in a task comment`,
            notification_type: 'task_mention',
          }));
        if (notifications.length) {
          await supabase.from('terminal_notifications' as any).insert(notifications);
        }

        // Fire-and-forget email notification for mentions
        if (mentionedOthers.length) {
          try {
            const { sendTaskEmail } = await import('@/utils/taskEmail');
            sendTaskEmail({
              eventType: 'task_mention',
              taskId,
              taskTitle: `Task Comment`,
              taskDescription: content.substring(0, 200),
              assignedByName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Someone',
              ccUserIds: mentionedOthers,
            });
          } catch {}
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-task-comments'] });
      queryClient.invalidateQueries({ queryKey: ['erp-task-activity'] });
    },
  });
}
