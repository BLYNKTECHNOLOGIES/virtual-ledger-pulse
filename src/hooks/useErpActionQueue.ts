import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from "@/lib/system-action-logger";

export interface ErpActionQueueItem {
  id: string;
  movement_id: string;
  movement_type: string;
  asset: string;
  amount: number;
  tx_id: string | null;
  network: string | null;
  wallet_id: string | null;
  movement_time: number;
  status: string;
  action_type: string | null;
  erp_reference_id: string | null;
  processed_by: string | null;
  processed_at: string | null;
  reject_reason: string | null;
  raw_data: any;
  created_at: string;
}

// Fetch pending items from erp_action_queue
export function useErpActionQueue() {
  return useQuery({
    queryKey: ["erp_action_queue", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_action_queue")
        .select("*")
        .eq("status", "PENDING")
        .order("movement_time", { ascending: false });
      if (error) throw error;
      return (data || []) as ErpActionQueueItem[];
    },
    refetchInterval: 30000,
  });
}

// Sync check - triggers checkNewMovements on the edge function
export function useCheckNewMovements() {
  const queryClient = useQueryClient();
  const lastCheckRef = useRef<number>(0);

  const checkMutation = useMutation({
    mutationFn: async () => {
      // First trigger asset movement sync
      const { data: syncResult } = await supabase.functions.invoke("binance-assets", {
        body: { action: "syncAssetMovements" },
      });
      console.log("syncAssetMovements result:", syncResult);

      // Then check for new movements to queue
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "checkNewMovements" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erp_action_queue"] });
    },
  });

  // Auto-check on mount with 5-minute stale check
  useEffect(() => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (now - lastCheckRef.current > fiveMinutes) {
      lastCheckRef.current = now;
      checkMutation.mutate();
    }
  }, []);

  return checkMutation;
}

// Reject a queue item
export function useRejectQueueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const userId = getCurrentUserId();
      const { error } = await supabase
        .from("erp_action_queue")
        .update({
          status: "REJECTED",
          reject_reason: reason || null,
          processed_by: userId || null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: "erp.action_rejected" as any,
        entityType: "erp_action_queue" as any,
        entityId: variables.id,
        module: "ERP" as any,
        metadata: { reason: variables.reason },
      });
      queryClient.invalidateQueries({ queryKey: ["erp_action_queue"] });
    },
  });
}

// Mark queue item as processed
export function useProcessQueueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      actionType,
      erpReferenceId,
    }: {
      id: string;
      actionType: string;
      erpReferenceId?: string;
    }) => {
      const userId = getCurrentUserId();
      const { error } = await supabase
        .from("erp_action_queue")
        .update({
          status: "PROCESSED",
          action_type: actionType,
          erp_reference_id: erpReferenceId || null,
          processed_by: userId || null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: "erp.action_processed" as any,
        entityType: "erp_action_queue" as any,
        entityId: variables.id,
        module: "ERP" as any,
        metadata: { action_type: variables.actionType, erp_reference_id: variables.erpReferenceId },
      });
      queryClient.invalidateQueries({ queryKey: ["erp_action_queue"] });
    },
  });
}
