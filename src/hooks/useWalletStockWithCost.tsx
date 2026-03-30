
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAverageCost } from "./useAverageCost";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";

export interface WalletStockWithCost {
  wallet_id: string;
  wallet_name: string;
  current_balance: number;
  chain_name: string;
  average_cost: number;
  total_value: number;
}

export interface ProductStockWithCost {
  product_id: string;
  product_name: string;
  product_code: string;
  unit_of_measurement: string;
  total_stock: number;
  average_cost: number;
  total_value: number;
  wallet_stocks: {
    wallet_id: string;
    wallet_name: string;
    balance: number;
    value: number;
  }[];
}

export function useWalletStockWithCost() {
  const { data: averageCosts } = useAverageCost();
  
  return useQuery({
    queryKey: ['wallet_stock_with_cost', averageCosts],
    queryFn: async () => {
      const wallets = await fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, chain_name, current_balance');

      // Use USDT average cost for all wallets (default asset)
      const usdtCost = averageCosts?.find(cost => cost.product_code === 'USDT')?.average_cost || 0;

      const result: WalletStockWithCost[] = wallets.map(wallet => {
        return {
          wallet_id: String(wallet.id),
          wallet_name: String(wallet.wallet_name),
          current_balance: Number(wallet.current_balance || 0),
          chain_name: String(wallet.chain_name || ''),
          average_cost: usdtCost,
          total_value: Number(wallet.current_balance || 0) * usdtCost
        };
      });
      
      return result;
    },
    enabled: !!averageCosts,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function useProductStockWithCost() {
  const { data: averageCosts } = useAverageCost();

  return useQuery({
    queryKey: ['product_stock_with_cost', averageCosts],
    queryFn: async () => {
      // 1. Fetch all products
      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (pErr) throw pErr;

      // 2. Wallet names from active wallets
      const { data: wallets, error: wErr } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .eq('is_active', true);
      if (wErr) throw wErr;

      const walletNameMap = new Map<string, string>();
      wallets?.forEach(w => {
        walletNameMap.set(w.id, w.wallet_name);
      });

      // 3. Use wallet_asset_balances as source of truth for all assets (including USDT)
      const { data: assetBalances, error: abErr } = await supabase
        .from('wallet_asset_balances')
        .select('wallet_id, asset_code, balance');
      if (abErr) throw abErr;

      const balanceMapByAsset = new Map<string, Map<string, number>>(); // asset -> walletId -> balance

      assetBalances?.forEach(ab => {
        const asset = ab.asset_code;
        const walletId = ab.wallet_id;
        const balance = Number(ab.balance) || 0;

        if (!balanceMapByAsset.has(asset)) balanceMapByAsset.set(asset, new Map());
        balanceMapByAsset.get(asset)!.set(walletId, balance);
      });

      // 4. Build product summaries
      const costMap = new Map<string, number>();
      averageCosts?.forEach(c => costMap.set(c.product_code, c.average_cost));

      const summaries: ProductStockWithCost[] = (products || []).map(product => {
        const avgCost = costMap.get(product.code) || 0;
        const walletStocks: ProductStockWithCost['wallet_stocks'] = [];
        let totalStock = 0;

        // Use wallet_asset_balances for all assets (including USDT)
        const assetBalancesForCode = balanceMapByAsset.get(product.code);
        if (assetBalancesForCode) {
          assetBalancesForCode.forEach((balance, walletId) => {
            const name = walletNameMap.get(walletId);
            if (name) {
              walletStocks.push({
                wallet_id: walletId,
                wallet_name: name,
                balance,
                value: balance * avgCost,
              });
              totalStock += balance;
            }
          });
        }

        // Sort wallets by balance descending
        walletStocks.sort((a, b) => b.balance - a.balance);

        return {
          product_id: product.id,
          product_name: product.name,
          product_code: product.code,
          unit_of_measurement: product.unit_of_measurement,
          total_stock: totalStock,
          average_cost: avgCost,
          total_value: totalStock * avgCost,
          wallet_stocks: walletStocks,
        };
      });

      return summaries;
    },
    enabled: !!averageCosts,
    refetchInterval: 10000,
    staleTime: 0,
  });
}
