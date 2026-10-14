import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PendingRegistration {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string;
  email: string;
  phone: string | null;
  badge_id: string | null;
  status: string;
  submitted_at: string;
}

/**
 * Sign-ups waiting for a Super Admin. One query shared by the Approvals tab
 * and the page header count (same key, same fetch), so the number on the tab
 * and the list underneath always agree.
 */
export function usePendingRegistrations(enabled = true) {
  return useQuery({
    queryKey: ["pending-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_registrations")
        .select(
          "id,username,email,first_name,last_name,phone,status,submitted_at,reviewed_at,reviewed_by,rejection_reason,badge_id,user_id"
        )
        // DB stores status as 'PENDING' (historically some code used 'pending').
        // Accept both so the approvals portal never silently shows 0.
        .in("status", ["PENDING", "pending"])
        // Table uses submitted_at (not created_at)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data as PendingRegistration[];
    },
    enabled,
  });
}
