
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WalletAssetPosition {
  id: string;
  wallet_id: string;
  asset_code: string;
  qty_on_hand: number;
  cost_pool_usdt: number;
  avg_cost_usdt: number;
  updated_at: string;
}

export function useWalletAssetPositions(walletId?: string) {
  return useQuery({
    queryKey: ['wallet_asset_positions', walletId],
    queryFn: async () => {
      let query = supabase
        .from('wallet_asset_positions' as any)
        .select('*')
        .order('asset_code');

      if (walletId) {
        query = query.eq('wallet_id', walletId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WalletAssetPosition[];
    },
    enabled: walletId ? !!walletId : true,
  });
}

export function useAssetPosition(walletId?: string, assetCode?: string) {
  return useQuery({
    queryKey: ['wallet_asset_positions', walletId, assetCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_asset_positions' as any)
        .select('*')
        .eq('wallet_id', walletId!)
        .eq('asset_code', assetCode!)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as WalletAssetPosition | null;
    },
    enabled: !!walletId && !!assetCode,
  });
}
