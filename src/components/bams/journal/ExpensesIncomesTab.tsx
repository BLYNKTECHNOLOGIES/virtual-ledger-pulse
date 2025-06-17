
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionSummary } from "./components/TransactionSummary";

export function ExpensesIncomesTab() {
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

  // Fetch transactions for summary
  const { data: transactions } = useQuery({
    queryKey: ['bank_transactions_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <TransactionForm bankAccounts={bankAccounts || []} />
      <TransactionSummary transactions={transactions || []} />
    </div>
  );
}
