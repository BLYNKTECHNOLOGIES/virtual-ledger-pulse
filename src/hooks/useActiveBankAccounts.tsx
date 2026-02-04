import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveBankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC: string | null;
  branch: string | null;
  balance: number;
  lien_amount: number;
  status: string;
  account_status: string;
  bank_account_holder_name: string | null;
  account_type: string;
  subsidiary_id: string | null;
  created_at: string;
  updated_at: string;
  dormant_at: string | null;
  dormant_by: string | null;
}

/**
 * Hook to fetch active, non-dormant bank accounts.
 * Dormant banks are excluded from all selections and calculations.
 * Use this hook for:
 * - Bank account selectors (payments, expenses, tax, settlements)
 * - Balance calculations
 * - Dashboard summaries
 * - Reports and exports
 */
export function useActiveBankAccounts(enabled: boolean = true) {
  return useQuery({
    queryKey: ['active_non_dormant_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .eq('account_status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');

      if (error) throw error;
      return data as ActiveBankAccount[];
    },
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
}

/**
 * Calculate total available balance from active, non-dormant bank accounts
 */
export function calculateTotalAvailableBalance(accounts: ActiveBankAccount[] | undefined): number {
  if (!accounts) return 0;
  return accounts.reduce((sum, account) => {
    const availableBalance = Number(account.balance) - Number(account.lien_amount || 0);
    return sum + availableBalance;
  }, 0);
}

/**
 * Calculate total balance (including lien) from active, non-dormant bank accounts
 */
export function calculateTotalBalance(accounts: ActiveBankAccount[] | undefined): number {
  if (!accounts) return 0;
  return accounts.reduce((sum, account) => sum + Number(account.balance), 0);
}

/**
 * Calculate total lien amount from active, non-dormant bank accounts
 */
export function calculateTotalLienAmount(accounts: ActiveBankAccount[] | undefined): number {
  if (!accounts) return 0;
  return accounts.reduce((sum, account) => sum + Number(account.lien_amount || 0), 0);
}
