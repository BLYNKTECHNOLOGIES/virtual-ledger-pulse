import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

interface TerminalNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  related_user_id: string | null;
  is_read: boolean;
  is_active: boolean;
  created_at: string;
}

export function useTerminalNotifications() {
  const { userId } = useTerminalAuth();

  return useQuery({
    queryKey: ['terminal-notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('terminal_notifications' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as TerminalNotification[];
    },
    enabled: !!userId,
    refetchInterval: 30_000, // Refresh every 30s
  });
}

export function useUnreadNotificationCount() {
  const { data: notifications } = useTerminalNotifications();
  return (notifications || []).filter(n => !n.is_read).length;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('terminal_notifications' as any)
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { userId } = useTerminalAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('terminal_notifications' as any)
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)
        .eq('is_active', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-notifications'] });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('terminal_notifications' as any)
        .update({ is_active: false, is_read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-notifications'] });
    },
  });
}
