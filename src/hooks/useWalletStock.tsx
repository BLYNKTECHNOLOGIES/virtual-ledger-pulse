import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

export interface WalletStockItem {
  wallet_id: string;
  wallet_name: string;
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
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');

      if (error) throw error;

      const result: WalletStockItem[] = wallets?.map(wallet => ({
        wallet_id: wallet.id,
        wallet_name: wallet.wallet_name,
        current_balance: wallet.current_balance || 0,
        chain_name: wallet.chain_name || ''
      })) || [];
      
      return result;
    },
    refetchInterval: 10000,
    staleTime: 0,
  });
}

export function useProductStockSummary() {
  const { isLoading, error } = useWalletStock();

  // Use wallet_asset_balances for per-asset grouping
  const { data: assetBalances } = useQuery({
    queryKey: ['wallet_asset_balances_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_asset_balances')
        .select('wallet_id, asset_code, balance')
        .order('asset_code');
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
    staleTime: 0,
  });

  const { data: wallets } = useQuery({
    queryKey: ['wallets_for_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  const walletMap = new Map(wallets?.map(w => [w.id, w.wallet_name]) || []);
  const activeWalletIds = new Set(wallets?.map(w => w.id) || []);

  const productSummaries = assetBalances?.reduce((acc, ab) => {
    // Only include active wallets
    if (!activeWalletIds.has(ab.wallet_id)) return acc;
    
    const code = ab.asset_code;
    if (!acc[code]) {
      acc[code] = {
        product_id: code,
        product_name: code,
        product_code: code,
        unit_of_measurement: 'Units',
        total_stock: 0,
        wallet_stocks: []
      };
    }

    acc[code].total_stock += ab.balance;
    acc[code].wallet_stocks.push({
      wallet_id: ab.wallet_id,
      wallet_name: walletMap.get(ab.wallet_id) || 'Unknown',
      balance: ab.balance
    });

    return acc;
  }, {} as Record<string, ProductStockSummary>);

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
  description?: string,
  createdBy?: string | null,
  assetCode: string = 'USDT'
) {
  let createdByUserId = createdBy;
  if (createdByUserId === undefined) {
    const rawUserId = getCurrentUserId();
    const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
    createdByUserId = isValidUuid ? rawUserId : null;
  }

  if ((transactionType === 'DEBIT' || transactionType === 'TRANSFER_OUT') && amount > 0) {
    // Check asset-specific balance
    const { data: assetBal } = await supabase
      .from('wallet_asset_balances')
      .select('balance')
      .eq('wallet_id', walletId)
      .eq('asset_code', assetCode)
      .single();
    
    if (!assetBal || assetBal.balance < amount) {
      throw new Error(`Insufficient ${assetCode} balance! Available: ${(assetBal?.balance || 0).toFixed(4)}`);
    }
  }

  // Get asset-specific balance for balance_before/after (trigger handles this, but we pass defaults)
  const { error } = await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: walletId,
      transaction_type: transactionType,
      amount,
      asset_code: assetCode,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
      balance_before: 0, // Auto-set by DB trigger
      balance_after: 0,  // Auto-set by DB trigger
      created_by: createdByUserId
    });

  if (error) throw error;
}
