import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CreditSubLedger {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Shared master list of credit sub-ledgers (persons) usable across all
 * BAMS credit accounts. Sub-ledgers only add a person-wise breakdown layer;
 * they never affect the main credit account balance calculations.
 */
export function useCreditSubLedgers(includeInactive = false) {
  return useQuery({
    queryKey: ["credit_sub_ledgers", includeInactive],
    queryFn: async () => {
      let query = supabase
        .from("credit_sub_ledgers")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CreditSubLedger[];
    },
    staleTime: 60_000,
  });
}

export function useCreateSubLedger() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Sub-ledger name is required");

      const createdBy = user?.id && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;

      const { data, error } = await supabase
        .from("credit_sub_ledgers")
        .insert({ name: trimmed, created_by: createdBy })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("A sub-ledger with this name already exists");
        }
        throw error;
      }
      return data as CreditSubLedger;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_sub_ledgers"] });
    },
  });
}
