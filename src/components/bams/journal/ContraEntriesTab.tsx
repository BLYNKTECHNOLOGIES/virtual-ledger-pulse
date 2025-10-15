
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransferForm } from "./components/TransferForm";
import { TransferHistory } from "./components/TransferHistory";
import { PermissionGate } from "@/components/PermissionGate";

export function ContraEntriesTab() {
  // Fetch bank accounts from Supabase
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent transfers
  const { data: transfers } = useQuery({
    queryKey: ['bank_transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .in('transaction_type', ['TRANSFER_IN', 'TRANSFER_OUT'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
        <TransferForm bankAccounts={bankAccounts || []} />
      </PermissionGate>
      <TransferHistory transfers={transfers || []} />
    </div>
  );
}
