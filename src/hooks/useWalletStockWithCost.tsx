
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAverageCost } from "./useAverageCost";

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
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');

      if (error) {
        throw error;
      }

      // Use USDT average cost for all wallets (default asset)
      const usdtCost = averageCosts?.find(cost => cost.product_code === 'USDT')?.average_cost || 0;

      const result: WalletStockWithCost[] = wallets?.map(wallet => {
        return {
          wallet_id: wallet.id,
          wallet_name: wallet.wallet_name,
          current_balance: wallet.current_balance || 0,
          chain_name: wallet.chain_name || '',
          average_cost: usdtCost,
          total_value: (wallet.current_balance || 0) * usdtCost
        };
      }) || [];
      
      return result;
    },
    enabled: !!averageCosts,
    refetchInterval: 10000,
    staleTime: 0,
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

      // 2. Fetch all wallet transactions grouped by asset & wallet
      const { data: txns, error: txErr } = await supabase
        .from('wallet_transactions')
        .select('wallet_id, asset_code, transaction_type, amount');
      if (txErr) throw txErr;

      // 3. Fetch wallets for name lookup
      const { data: wallets, error: wErr } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .eq('is_active', true);
      if (wErr) throw wErr;

      const walletNameMap = new Map<string, string>();
      wallets?.forEach(w => walletNameMap.set(w.id, w.wallet_name));

      // 4. Derive per-asset per-wallet balances from transactions
      // CREDIT, TRANSFER_IN = inflow; DEBIT, TRANSFER_OUT, FEE = outflow
      const INFLOW_TYPES = ['CREDIT', 'TRANSFER_IN'];
      const balanceMap = new Map<string, Map<string, number>>(); // asset -> walletId -> balance

      txns?.forEach(txn => {
        const asset = txn.asset_code || 'USDT';
        const walletId = txn.wallet_id;
        const amount = Number(txn.amount) || 0;
        const isInflow = INFLOW_TYPES.includes(txn.transaction_type);
        const signed = isInflow ? amount : -amount;

        if (!balanceMap.has(asset)) balanceMap.set(asset, new Map());
        const walletMap = balanceMap.get(asset)!;
        walletMap.set(walletId, (walletMap.get(walletId) || 0) + signed);
      });

      // 5. Build product summaries
      const costMap = new Map<string, number>();
      averageCosts?.forEach(c => costMap.set(c.product_code, c.average_cost));

      const summaries: ProductStockWithCost[] = (products || []).map(product => {
        const assetBalances = balanceMap.get(product.code);
        const avgCost = costMap.get(product.code) || 0;
        
        const walletStocks: ProductStockWithCost['wallet_stocks'] = [];
        let totalStock = 0;

        if (assetBalances) {
          assetBalances.forEach((balance, walletId) => {
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
