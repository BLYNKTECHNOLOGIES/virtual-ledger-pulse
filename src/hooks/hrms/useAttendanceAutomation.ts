import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AttendanceAutomationState {
  state: "running" | "paused_auto" | "paused_manual";
  paused_since: string | null;
  paused_reason: string | null;
  auto_pause_threshold_minutes: number;
  settle_minutes: number;
  last_checked_at: string | null;
}

export interface AttendanceOutage {
  id: string;
  started_at: string;
  ended_at: string | null;
  trigger: string;
  reason: string | null;
  from_date: string | null;
  to_date: string | null;
  recovery_status: string;
  mail_release_status: string;
  recovery_result: any;
  silent_devices: any;
}

export function useAttendanceAutomation() {
  const qc = useQueryClient();

  const state = useQuery<AttendanceAutomationState | null>({
    queryKey: ["hr_attendance_automation_state"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_attendance_automation_state")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      return data ?? null;
    },
  });

  const outages = useQuery<AttendanceOutage[]>({
    queryKey: ["hr_attendance_outages"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_attendance_outages")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["hr_attendance_automation_state"] });
    qc.invalidateQueries({ queryKey: ["hr_attendance_outages"] });
  };

  const pause = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await (supabase as any).rpc("hr_attendance_pause", { p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Attendance marking and emails paused"); },
    onError: (e: any) => toast.error(e.message),
  });

  const resume = useMutation({
    mutationFn: async (note: string) => {
      const { error } = await (supabase as any).rpc("hr_attendance_resume", { p_note: note });
      if (error) throw error;
      // Kick recovery immediately; it waits out its own settle window.
      await supabase.functions.invoke("hr-attendance-outage-recover", { body: {} });
    },
    onSuccess: () => { refresh(); toast.success("Resumed — missing days will be rebuilt and held emails sent"); },
    onError: (e: any) => toast.error(e.message),
  });

  const recoverNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("hr-attendance-outage-recover", { body: { force: true } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      refresh();
      toast.success(data?.message ?? `Rebuilt ${data?.employees_rebuilt ?? 0} employees and released held emails`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { state, outages, pause, resume, recoverNow };
}
