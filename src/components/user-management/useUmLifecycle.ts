import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RemovalSource = "user_management" | "hrms_deactivate" | "offboarding" | "signup_rejection";

export interface RemovalRecord {
  user_id: string;
  employee_id: string | null;
  registration_id: string | null;
  source: RemovalSource | null;
  reason: string | null;
  target_name: string | null;
  target_username: string | null;
  target_email: string | null;
  requested_by_name: string | null;
  requested_at: string;
  completed_at: string | null;
  attempts: number;
  last_error: string | null;
}

export interface HrmsState {
  employee_id: string;
  is_active: boolean;
  resignation_status: string | null;
  last_working_day: string | null;
  department: string | null;
  position: string | null;
}

export const SOURCE_LABEL: Record<RemovalSource, string> = {
  user_management: "User Management",
  hrms_deactivate: "HRMS Deactivate",
  offboarding: "Offboarding",
  signup_rejection: "Sign-up rejected",
};

/** Today's date in IST as YYYY-MM-DD. */
export const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** True when HRMS says the person has left (inactive, or last working day already passed). */
export function hasLeftHrms(h?: HrmsState | null): boolean {
  if (!h) return false;
  if (!h.is_active) return true;
  return !!h.last_working_day && h.last_working_day < todayIst();
}

/**
 * HRMS state for linked logins and the shared removal record, read from
 * public.um_lifecycle() (read-only; User Management viewers and above).
 */
export function useUmLifecycle(enabled = true) {
  const q = useQuery({
    queryKey: ["um-lifecycle"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("um_lifecycle");
      if (error) throw error;
      return (data ?? { can_retry: false, people: {}, removals: [] }) as {
        can_retry: boolean;
        people: Record<string, HrmsState>;
        removals: RemovalRecord[];
      };
    },
  });
  const removals = q.data?.removals ?? [];
  const byUser = new Map(removals.map((r) => [r.user_id, r]));
  return {
    ...q,
    canRetry: !!q.data?.can_retry,
    removals,
    hrmsFor: (userId: string): HrmsState | null => q.data?.people?.[userId] ?? null,
    removalFor: (userId: string): RemovalRecord | null => byUser.get(userId) ?? null,
  };
}

/** Permanent removal through the shared server path (record, clean-up, read-back, retries). */
type RemovalResult = { success: boolean; error?: string; pending?: boolean; recordId?: string };
export async function removeAccount(userId: string, reason: string): Promise<RemovalResult> {
  const { data, error } = await supabase.functions.invoke("delete-erp-user", { body: { userId, reason } });
  if (error) return { success: false, error: error.message || "Removal failed" };
  return data as { success: boolean; error?: string; pending?: boolean; recordId?: string };
}

export async function retryRemoval(userId: string) {
  const { data, error } = await supabase.functions.invoke("delete-erp-user", { body: { userId, retry: true } });
  if (error) return { success: false, error: error.message || "Retry failed" };
  return data as { success: boolean; error?: string };
}
