import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RAUser {
  id: string;
  name: string;
}

export interface RAAssignment {
  id: string;
  client_id: string;
  ra_user_id: string;
  ra_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RARemark {
  id: string;
  client_id: string;
  assignment_id: string | null;
  ra_user_id: string;
  ra_name: string | null;
  remark: string;
  contact_outcome: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

const userDisplayName = (u: any): string => {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.username || u.email || "Unknown";
};

/** Users who hold the ra_dashboard_view permission (the RAs). */
export function useRAUsers() {
  return useQuery({
    queryKey: ["ra-users"],
    queryFn: async (): Promise<RAUser[]> => {
      // role_ids that grant ra_dashboard_view
      const { data: rolePerms, error: rpErr } = await supabase
        .from("role_permissions")
        .select("role_id")
        .eq("permission", "ra_dashboard_view" as any);
      if (rpErr) throw rpErr;
      const roleIds = Array.from(new Set((rolePerms || []).map((r: any) => r.role_id)));
      if (roleIds.length === 0) return [];

      const { data: userRoles, error: urErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role_id", roleIds);
      if (urErr) throw urErr;
      const userIds = Array.from(new Set((userRoles || []).map((u: any) => u.user_id)));
      if (userIds.length === 0) return [];

      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, username, email, first_name, last_name, status")
        .in("id", userIds);
      if (uErr) throw uErr;

      return (users || [])
        .filter((u: any) => u.status !== "inactive")
        .map((u: any) => ({ id: u.id, name: userDisplayName(u) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Map of clientId -> active assignment. */
export function useActiveRAAssignments() {
  return useQuery({
    queryKey: ["ra-assignments", "active"],
    queryFn: async (): Promise<Map<string, RAAssignment>> => {
      const PAGE = 1000;
      let from = 0;
      const all: RAAssignment[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("ra_assignments")
          .select("*")
          .eq("status", "active")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const map = new Map<string, RAAssignment>();
      all.forEach((a) => map.set(a.client_id, a));
      return map;
    },
    staleTime: 60 * 1000,
  });
}

/** All assignments across every status (for manager overview). */
export function useAllRAAssignments() {
  return useQuery({
    queryKey: ["ra-assignments", "all"],
    queryFn: async (): Promise<RAAssignment[]> => {
      const PAGE = 1000;
      let from = 0;
      const all: RAAssignment[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("ra_assignments")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60 * 1000,
  });
}

/** Active assignments for the current logged-in RA. */
export function useMyRAAssignments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ra-assignments", "mine", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<RAAssignment[]> => {
      const { data, error } = await supabase
        .from("ra_assignments")
        .select("*")
        .eq("status", "active")
        .eq("ra_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
    staleTime: 60 * 1000,
  });
}

/** Remarks for a single client (full conversation log). */
export function useClientRARemarks(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["ra-remarks", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<RARemark[]> => {
      const { data, error } = await supabase
        .from("ra_client_remarks")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any;
    },
  });
}

/** All remarks (for assignments overview / per-RA views). */
export function useAllRARemarks() {
  return useQuery({
    queryKey: ["ra-remarks", "all"],
    queryFn: async (): Promise<RARemark[]> => {
      const PAGE = 1000;
      let from = 0;
      const all: RARemark[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("ra_client_remarks")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 60 * 1000,
  });
}

export function useAssignClientsToRA() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      clientIds,
      raUser,
    }: {
      clientIds: string[];
      raUser: RAUser;
    }) => {
      const assignerName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.username ||
        user?.email ||
        "Unknown";

      // Deactivate existing active assignments for these clients (re-assignment)
      const { error: deErr } = await supabase
        .from("ra_assignments")
        .update({ status: "reassigned" } as any)
        .in("client_id", clientIds)
        .neq("status", "reassigned");
      if (deErr) throw deErr;

      const rows = clientIds.map((cid) => ({
        client_id: cid,
        ra_user_id: raUser.id,
        ra_name: raUser.name,
        assigned_by: user?.id ?? null,
        assigned_by_name: assignerName,
        status: "active",
      }));
      const { error } = await supabase.from("ra_assignments").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ra-assignments"] });
    },
  });
}

export function useAddRARemark() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      clientId,
      assignmentId,
      remark,
      contactOutcome,
      file,
    }: {
      clientId: string;
      assignmentId?: string | null;
      remark: string;
      contactOutcome?: string | null;
      file?: File | null;
    }) => {
      const raName =
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.username ||
        user?.email ||
        "Relationship Associate";

      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (file) {
        const path = `${clientId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("ra-remarks")
          .upload(path, file);
        if (upErr) throw upErr;
        fileUrl = path;
        fileName = file.name;
      }

      const { error } = await supabase.from("ra_client_remarks").insert({
        client_id: clientId,
        assignment_id: assignmentId ?? null,
        ra_user_id: user?.id,
        ra_name: raName,
        remark,
        contact_outcome: contactOutcome ?? null,
        file_url: fileUrl,
        file_name: fileName,
      } as any);
      if (error) throw error;

      // Terminal outcomes close the assignment so it drops off the RA dashboard
      // (but remains visible with its final status in the manager Assignments tab).
      const terminalStatus =
        contactOutcome === "Not Interested"
          ? "not_interested"
          : contactOutcome === "Converted"
          ? "converted"
          : null;
      if (terminalStatus && assignmentId) {
        const { error: stErr } = await supabase
          .from("ra_assignments")
          .update({ status: terminalStatus } as any)
          .eq("id", assignmentId);
        if (stErr) throw stErr;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ra-remarks", vars.clientId] });
      queryClient.invalidateQueries({ queryKey: ["ra-remarks", "all"] });
      queryClient.invalidateQueries({ queryKey: ["client-communication-logs", vars.clientId] });
      queryClient.invalidateQueries({ queryKey: ["ra-assignments"] });
    },
  });
}

/** Get a signed URL for a stored remark attachment. */
export async function getRemarkFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("ra-remarks")
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const CONTACT_OUTCOMES = [
  "Connected",
  "No Answer",
  "Callback Requested",
  "Converted",
  "Not Interested",
  "Wrong Number",
  "Other",
];
