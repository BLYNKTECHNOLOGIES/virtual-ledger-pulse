import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WalletWithFees {
  id: string;
  wallet_name: string;
  chain_name?: string;
  current_balance: number;
  fee_percentage: number;
  is_fee_enabled: boolean;
  is_active: boolean;
}

export function useWalletFees(walletId?: string) {
  return useQuery({
    queryKey: ['wallet_fees', walletId],
    queryFn: async () => {
      if (!walletId) return null;
      
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, chain_name, current_balance, fee_percentage, is_fee_enabled, is_active')
        .eq('id', walletId)
        .single();
      
      if (error) throw error;
      return data as WalletWithFees;
    },
    enabled: !!walletId,
  });
}

export function useWalletsWithFees() {
  return useQuery({
    queryKey: ['wallets_with_fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name, chain_name, current_balance, fee_percentage, is_fee_enabled, is_active')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (error) throw error;
      return data as WalletWithFees[];
    },
  });
}

export function calculateFee(amount: number, feePercentage: number): { feeAmount: number; netAmount: number } {
  const feeAmount = amount * (feePercentage / 100);
  const netAmount = amount - feeAmount;
  return { feeAmount, netAmount };
}
