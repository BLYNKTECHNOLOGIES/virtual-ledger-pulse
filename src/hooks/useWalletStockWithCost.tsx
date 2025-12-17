
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAverageCost } from "./useAverageCost";

export interface WalletStockWithCost {
  wallet_id: string;
  wallet_name: string;
  wallet_type: string;
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

      // Convert wallets to stock format with cost information
      const result: WalletStockWithCost[] = wallets?.map(wallet => {
        const averageCost = averageCosts?.find(cost => cost.product_code === wallet.wallet_type)?.average_cost || 0;
        
        return {
          wallet_id: wallet.id,
          wallet_name: wallet.wallet_name,
          wallet_type: wallet.wallet_type,
          current_balance: wallet.current_balance || 0,
          chain_name: wallet.chain_name || '',
          average_cost: averageCost,
          total_value: (wallet.current_balance || 0) * averageCost
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
  const { data: walletStockWithCost, isLoading, error } = useWalletStockWithCost();

  const productSummaries = walletStockWithCost?.reduce((acc, wallet) => {
    // For USDT, aggregate all wallet balances with cost info
    if (wallet.wallet_type === 'USDT') {
      if (!acc['USDT']) {
        acc['USDT'] = {
          product_id: 'USDT',
          product_name: 'USDT',
          product_code: 'USDT',
          unit_of_measurement: 'Units',
          total_stock: 0,
          average_cost: 0,
          total_value: 0,
          wallet_stocks: []
        };
      }

      acc['USDT'].total_stock += wallet.current_balance;
      acc['USDT'].total_value += wallet.total_value;
      
      // Calculate weighted average cost
      if (acc['USDT'].total_stock > 0) {
        acc['USDT'].average_cost = acc['USDT'].total_value / acc['USDT'].total_stock;
      }
      
      // Add wallet stocks with values
      acc['USDT'].wallet_stocks.push({
        wallet_id: wallet.wallet_id,
        wallet_name: wallet.wallet_name,
        balance: wallet.current_balance,
        value: wallet.total_value
      });
    }

    return acc;
  }, {} as Record<string, ProductStockWithCost>);

  return {
    data: productSummaries ? Object.values(productSummaries) : undefined,
    isLoading,
    error
  };
}
