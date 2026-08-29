import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorkflowNotification {
  id: string;
  type: string | null;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Persisted workflow notifications (leave requests, attendance regularizations,
 * bank change requests, …) addressed to the signed-in ERP user.
 * Written by DB triggers into `hr_notifications`, so managers see approvals
 * waiting on them inside the ERP bell — not only in HRMS.
 */
export function useWorkflowNotifications() {
  return useQuery({
    queryKey: ["erp_workflow_notifications"],
    queryFn: async (): Promise<WorkflowNotification[]> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return [];
      const { data, error } = await (supabase as any)
        .from("hr_notifications")
        .select("id, type, title, message, link, is_read, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        console.warn("[workflow notifications]", error.message);
        return [];
      }
      return (data || []) as WorkflowNotification[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkWorkflowNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("hr_notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_workflow_notifications"] }),
  });
}

export function useMarkAllWorkflowNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("hr_mark_all_notifications_read");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_workflow_notifications"] }),
  });
}
