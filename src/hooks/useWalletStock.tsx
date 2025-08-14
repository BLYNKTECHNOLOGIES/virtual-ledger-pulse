import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WalletStockItem {
  wallet_id: string;
  wallet_name: string;
  wallet_type: string;
  current_balance: number;
  chain_name: string;
}

export interface ProductStockSummary {
  product_id: string;
  product_name: string;
  product_code: string;
  unit_of_measurement: string;
  total_stock: number;
  wallet_stocks: {
    wallet_id: string;
    wallet_name: string;
    balance: number;
  }[];
}

export function useWalletStock() {
  return useQuery({
    queryKey: ['wallet_stock_summary'],
    queryFn: async () => {
      console.log('🔄 Fetching wallet stock data...');
      
      // Sync USDT stock with wallets
      console.log('🔄 Syncing USDT stock with wallets...');
      const { error: usdtSyncError } = await supabase.rpc('sync_usdt_stock');
      if (usdtSyncError) {
        console.error('❌ USDT sync failed in useWalletStock:', usdtSyncError);
      } else {
        console.log('✅ USDT stock synced successfully in useWalletStock');
      }
      
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');

      if (error) {
        console.error('Error fetching wallets:', error);
        throw error;
      }

      console.log('Raw wallet data:', wallets);

      // Convert wallets to stock format
      const result: WalletStockItem[] = wallets?.map(wallet => ({
        wallet_id: wallet.id,
        wallet_name: wallet.wallet_name,
        wallet_type: wallet.wallet_type,
        current_balance: wallet.current_balance || 0,
        chain_name: wallet.chain_name || ''
      })) || [];
      
      console.log('Processed wallet stock:', result);
      
      return result;
    },
    refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
    staleTime: 0, // Always refetch to ensure fresh data
  });
}

export function useProductStockSummary() {
  const { data: walletStock, isLoading, error } = useWalletStock();

  const productSummaries = walletStock?.reduce((acc, wallet) => {
    // For USDT, aggregate all wallet balances
    if (wallet.wallet_type === 'USDT') {
      if (!acc['USDT']) {
        acc['USDT'] = {
          product_id: 'USDT',
          product_name: 'USDT',
          product_code: 'USDT',
          unit_of_measurement: 'Pieces',
          total_stock: 0,
          wallet_stocks: []
        };
      }

      acc['USDT'].total_stock += wallet.current_balance;
      
      // Add wallet stocks (including zero balances for tracking)
      acc['USDT'].wallet_stocks.push({
        wallet_id: wallet.wallet_id,
        wallet_name: wallet.wallet_name,
        balance: wallet.current_balance
      });
    }

    return acc;
  }, {} as Record<string, ProductStockSummary>);

  console.log('Product summaries from wallets:', productSummaries);

  return {
    data: productSummaries ? Object.values(productSummaries) : undefined,
    isLoading,
    error
  };
}

// Hook to sync product total stock with wallet totals
export function useSyncProductStock() {
  const { data: productSummaries } = useProductStockSummary();

  const syncStock = async () => {
    if (!productSummaries) return;

    for (const product of productSummaries) {
      // Update the product's current_stock_quantity to match wallet totals
      const { error } = await supabase
        .from('products')
        .update({ 
          current_stock_quantity: product.total_stock 
        })
        .eq('code', product.product_code);

      if (error) {
        console.error('Error syncing product stock:', error);
      }
    }
  };

  return { syncStock, productSummaries };
}

// New function to validate and create wallet transaction
export async function createValidatedWalletTransaction(
  walletId: string,
  transactionType: 'CREDIT' | 'DEBIT' | 'TRANSFER_IN' | 'TRANSFER_OUT',
  amount: number,
  referenceType?: string,
  referenceId?: string,
  description?: string
) {
  // Validate wallet balance for DEBIT movements
  if ((transactionType === 'DEBIT' || transactionType === 'TRANSFER_OUT') && amount > 0) {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('current_balance')
      .eq('id', walletId)
      .single();
    
    if (!wallet || wallet.current_balance < amount) {
      throw new Error('It cannot be negative check previous entries and balances again!');
    }
  }

  // Create the wallet transaction
  const { error } = await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: walletId,
      transaction_type: transactionType,
      amount,
      reference_type: referenceType,
      reference_id: referenceId,
      description
    });

  if (error) throw error;
}
