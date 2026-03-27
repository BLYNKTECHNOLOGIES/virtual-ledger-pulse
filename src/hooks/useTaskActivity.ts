import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  details: any;
  created_at: string;
  user_name?: string;
}

export function useTaskActivity(taskId: string | null) {
  return useQuery({
    queryKey: ['erp-task-activity', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('erp_task_activity_log' as any)
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = new Set<string>();
      (data || []).forEach((a: any) => { if (a.user_id) userIds.add(a.user_id); });

      let userMap: Record<string, string> = {};
      if (userIds.size > 0) {
        const { data: users } = await supabase
          .from('users' as any)
          .select('id, full_name, username')
          .in('id', Array.from(userIds));
        (users || []).forEach((u: any) => {
          userMap[u.id] = u.full_name || u.username || 'Unknown';
        });
      }

      return (data || []).map((a: any) => ({
        ...a,
        user_name: userMap[a.user_id] || 'System',
      })) as TaskActivity[];
    },
    enabled: !!taskId,
  });
}
