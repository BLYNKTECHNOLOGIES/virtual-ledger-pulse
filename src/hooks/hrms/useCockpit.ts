import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CockpitStep {
  step_no: number;
  step_key: string;
  step_label: string;
  actor_hint: string;
  auto: boolean;
  live_status: "complete" | "incomplete";
  live_detail: Record<string, any>;
  ack_status: "pending" | "done" | "skipped" | "blocked" | null;
  ack_actor: string | null;
  ack_notes: string | null;
  ack_at: string | null;
}

function firstOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function useCockpitMonth(month: string) {
  return useQuery({
    queryKey: ["hr_cockpit_month_state", month],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_cockpit_month_state", { _month: month });
      if (error) throw error;
      return (data ?? []) as CockpitStep[];
    },
    staleTime: 30_000,
  });
}

export function useAckCockpitStep(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { step_no: number; status: string; notes?: string }) => {
      const { error } = await (supabase as any).rpc("hr_cockpit_ack_step", {
        _month: month,
        _step_no: args.step_no,
        _status: args.status,
        _notes: args.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] }),
    onError: (e: any) => toast.error(e.message || "Could not update step"),
  });
}

export function useCloseMonth(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_close_payroll_month", { _month: month });
      if (error) throw error;
      return data as { closed: boolean; blockers?: string[]; month?: string };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] });
      if (r?.closed) toast.success("Month closed");
      else toast.error(`Cannot close — ${r?.blockers?.length ?? 0} blockers remaining`);
    },
    onError: (e: any) => toast.error(e.message || "Close failed"),
  });
}

export { firstOfMonth };
