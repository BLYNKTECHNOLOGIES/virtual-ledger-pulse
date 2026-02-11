import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Default supported assets (P2P coins + stables)
export const DEFAULT_ASSET_CODES = [
  "USDT", "BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "SHIB", "TON", "USDC", "FDUSD"
];

export function useAssetCodes() {
  return useQuery({
    queryKey: ['distinct_asset_codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('asset_code')
        .order('asset_code');
      
      if (error) throw error;
      
      // Get unique asset codes from DB
      const dbCodes = [...new Set(data?.map(d => d.asset_code) || [])];
      // Merge with defaults
      const allCodes = [...new Set([...DEFAULT_ASSET_CODES, ...dbCodes])];
      return allCodes.sort();
    },
    staleTime: 60000,
  });
}

export function useWalletAssetBalances(walletId?: string) {
  return useQuery({
    queryKey: ['wallet_asset_balances', walletId],
    queryFn: async () => {
      let query = supabase
        .from('wallet_asset_balances')
        .select('*')
        .order('asset_code');
      
      if (walletId) {
        query = query.eq('wallet_id', walletId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: walletId ? !!walletId : true,
  });
}
