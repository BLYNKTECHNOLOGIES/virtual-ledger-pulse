import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActionWithCurrentUser } from "@/lib/system-action-logger";
import { useToast } from "@/hooks/use-toast";
import type { ExceptionItem } from "@/hooks/useReconciliationCockpit";

type ActionKind = "acknowledge" | "resolve" | "reopen";

function userDisplayName(user: any): string {
  if (!user) return "Unknown";
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || "Unknown";
}

export function useReconciliationActions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      item,
      kind,
      reason,
    }: {
      item: ExceptionItem;
      kind: ActionKind;
      reason?: string;
    }) => {
      const now = new Date().toISOString();
      const name = userDisplayName(user);
      const userId = user?.id || null;

      // Drift alerts carry their own ack/resolve columns.
      if (item.raw?.ackColumn && item.lane === "drift") {
        const driftId = item.raw.id;
        if (kind === "acknowledge") {
          await supabase
            .from("erp_drift_alerts")
            .update({ acknowledged_at: now, acknowledged_by: userId })
            .eq("id", driftId);
        } else if (kind === "resolve") {
          await supabase
            .from("erp_drift_alerts")
            .update({ resolved_at: now, acknowledged_at: item.raw.acknowledged_at || now, acknowledged_by: userId })
            .eq("id", driftId);
        } else {
          await supabase
            .from("erp_drift_alerts")
            .update({ resolved_at: null })
            .eq("id", driftId);
        }
      } else {
        // Derived exceptions persist state in reconciliation_exception_state.
        const patch: Record<string, any> = {
          exception_type: item.lane,
          exception_ref: item.ref,
        };
        if (kind === "acknowledge") {
          patch.acknowledged_at = now;
          patch.acknowledged_by = userId;
          patch.acknowledged_by_name = name;
        } else if (kind === "resolve") {
          patch.resolved_at = now;
          patch.resolved_by = userId;
          patch.resolved_by_name = name;
          patch.resolution_reason = reason || null;
        } else {
          patch.resolved_at = null;
          patch.resolved_by = null;
          patch.resolved_by_name = null;
          patch.resolution_reason = null;
        }
        const { error } = await (supabase
          .from("reconciliation_exception_state") as any)
          .upsert(patch, { onConflict: "exception_type,exception_ref" });
        if (error) throw error;
      }

      // Audit log (non-blocking).
      logActionWithCurrentUser({
        actionType: `reconciliation.${kind}`,
        entityType: item.lane,
        entityId: item.ref,
        module: "reconciliation",
        userName: name,
        metadata: { title: item.title, reason: reason || null },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-cockpit"] });
      const verb =
        variables.kind === "acknowledge"
          ? "acknowledged"
          : variables.kind === "resolve"
          ? "resolved"
          : "reopened";
      toast({ title: `Exception ${verb}`, description: variables.item.title });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message || "Could not update exception state.",
        variant: "destructive",
      });
    },
  });

  return {
    acknowledge: (item: ExceptionItem) => mutation.mutate({ item, kind: "acknowledge" }),
    resolve: (item: ExceptionItem, reason?: string) => mutation.mutate({ item, kind: "resolve", reason }),
    reopen: (item: ExceptionItem) => mutation.mutate({ item, kind: "reopen" }),
    isPending: mutation.isPending,
  };
}
