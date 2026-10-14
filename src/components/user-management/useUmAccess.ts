import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Per-person actions the server will allow (UM-2A R4/S3). */
export interface UmUserActions {
  details: boolean;
  status: boolean;
  link: boolean;
  reset: boolean;
  delete: boolean;
  role: boolean;
  terminal: boolean;
}

export interface UmAccess {
  rank: number;
  is_super_admin: boolean;
  can_delegate: boolean;
  can_manage_accounts: boolean;
  can_hr_manage: boolean;
  held_permissions: string[];
  held_function_ids: string[];
  manageable_role_ids: string[];
  assignable_role_ids: string[];
  terminal: { unrestricted: boolean; can_assign: boolean; grantable_role_ids: string[] };
  users: Record<string, UmUserActions>;
}

const NONE: UmUserActions = { details: false, status: false, link: false, reset: false, delete: false, role: false, terminal: false };

/**
 * What the signed-in person may do in User Management, computed by the server
 * (public.um_my_access) with the same functions that enforce each rule, so
 * buttons appear only when the server will accept the action.
 */
export function useUmAccess() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["um-access", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("um_my_access");
      if (error) throw error;
      return data as UmAccess | null;
    },
  });
  const access = q.data ?? null;
  return {
    access,
    isLoading: q.isLoading,
    refetch: q.refetch,
    actionsFor: (userId: string): UmUserActions => access?.users?.[userId] ?? NONE,
    canManageRole: (roleId: string) => !!access?.manageable_role_ids?.includes(roleId),
    canAssignRole: (roleId: string) => !!access?.assignable_role_ids?.includes(roleId),
    holds: (perm: string) => !!access?.held_permissions?.includes(perm),
  };
}

/** Reads the message from a Supabase/PostgREST error for showing to the user. */
export function errorText(error: any, fallback: string): string {
  return (error?.message || error?.error || "").toString().trim() || fallback;
}
