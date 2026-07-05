import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared active-wallets query for the Stock Management tabs.
 * Consolidates the previously duplicated `wallets-active` / `wallets_for_reports`
 * queries (Reports + Conversion subtables) into a single cache entry.
 * Select is a superset (`id, wallet_name, wallet_type`) so every existing
 * consumer's used fields (id, wallet_name) resolve to byte-identical data.
 */
export function useStockWallets() {
  return useQuery({
    queryKey: ["stock_wallets_shared"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("id, wallet_name, wallet_type")
        .eq("is_active", true)
        .order("wallet_name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });
}
