import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";

/**
 * AM-SEC-7 — who the signed-in user may edit on the Terminal Users page.
 * Mirrors the server rule (terminal_may_manage_target): Super Admin / Terminal
 * admin anyone incl. themselves; manage_all everyone else; manage / manage
 * subordinates only their supervisor-mapping subordinates; never themselves.
 */
export function useTerminalEditableUsers() {
  const { userId } = useTerminalAuth();
  const q = useQuery({
    queryKey: ["terminal-editable-user-ids", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("terminal_editable_user_ids" as any);
      if (error) throw error;
      return new Set<string>(((data as string[] | null) ?? []).map(String));
    },
  });

  /** null = may edit; otherwise the reason shown on the disabled control. */
  const editReason = (targetUserId: string): string | null => {
    if (q.isLoading) return "Checking your rights…";
    if (q.isError) return "Couldn't check your rights — refresh to try again.";
    if (q.data?.has(targetUserId)) return null;
    if (targetUserId === userId) return "Only Super Admin or a Terminal admin can change their own Terminal settings.";
    return "You can only change Terminal settings for people you manage.";
  };

  return { editReason, isLoading: q.isLoading };
}
