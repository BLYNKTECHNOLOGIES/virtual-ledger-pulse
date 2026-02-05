 import { useState } from "react";
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionSummary } from "./components/TransactionSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { 
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
 import { TrendingUp, TrendingDown, ArrowRightLeft, Pencil, Trash2 } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
 import { useToast } from "@/hooks/use-toast";
 import { EditExpenseDialog } from "./components/EditExpenseDialog";

export function ExpensesIncomesTab() {
   const { toast } = useToast();
   const queryClient = useQueryClient();
   const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
   const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
   const [editDialogOpen, setEditDialogOpen] = useState(false);
   const [transactionToEdit, setTransactionToEdit] = useState<any>(null);
 
  // Fetch bank accounts from Supabase (excluding dormant)
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch only bank transactions (no purchase orders) - exclude purchase-related transactions
  const { data: transactions } = useQuery({
    queryKey: ['bank_transactions_only'],
    queryFn: async () => {
      console.log('🔍 Fetching bank transactions for ExpensesIncomesTab...');
      
      // Fetch only bank transactions - exclude purchase-related ones
      const { data: bankData, error: bankError } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name),
          created_by_user:users!created_by(username, first_name, last_name),
          clients!client_id(id, name, client_id)
        `)
        .in('transaction_type', ['INCOME', 'EXPENSE'])
        .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading")') // Exclude core trading operations
        .order('created_at', { ascending: false });
      
      if (bankError) {
        console.error('❌ Bank transactions fetch error:', bankError);
        throw bankError;
      }
      
      console.log(`📊 Found ${bankData?.length || 0} bank transactions`);
      console.log('💳 Bank transactions sample:', bankData?.slice(0, 3));

      // Format transactions for display
      const formattedTransactions = (bankData || []).map(t => ({
        ...t,
        source: 'BANK',
        display_type: t.transaction_type,
        display_description: t.description || '',
        display_reference: t.reference_number || '',
        display_account: t.bank_accounts?.account_name + ' - ' + t.bank_accounts?.bank_name,
        display_client: t.clients?.name || null
      }));

      return formattedTransactions;
    },
    refetchInterval: 5000, // Refresh every 5 seconds to catch new transactions
    staleTime: 0,
  });

   // Delete mutation
   const deleteTransactionMutation = useMutation({
     mutationFn: async (transactionId: string) => {
       const { error } = await supabase
         .from('bank_transactions')
         .delete()
         .eq('id', transactionId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       toast({
         title: "Success",
         description: "Transaction deleted successfully. Bank balance updated.",
       });
       queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
       queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
       queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
       setDeleteDialogOpen(false);
       setTransactionToDelete(null);
     },
     onError: (error: any) => {
       toast({
         title: "Error",
         description: error.message || "Failed to delete transaction",
         variant: "destructive",
       });
     },
   });
 
   const handleDeleteClick = (transaction: any) => {
     setTransactionToDelete(transaction);
     setDeleteDialogOpen(true);
   };
 
   const handleEditClick = (transaction: any) => {
     setTransactionToEdit(transaction);
     setEditDialogOpen(true);
   };
 
   const confirmDelete = () => {
     if (transactionToDelete) {
       deleteTransactionMutation.mutate(transactionToDelete.id);
     }
   };
 
  // Get recent transactions (last 10)
  const recentTransactions = transactions?.slice(0, 10) || [];

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'EXPENSE':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'text-green-700';
      case 'EXPENSE':
        return 'text-red-700';
      default:
        return 'text-blue-700';
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'default';
      case 'EXPENSE':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
        <TransactionForm bankAccounts={bankAccounts || []} />
      </PermissionGate>
      <TransactionSummary transactions={transactions || []} />
      
      {/* Recent Bank Transactions Only */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Recent Expenses & Incomes
            <Badge variant="secondary">{recentTransactions.length} recent entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent transactions found
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-full">
                      {getTransactionIcon(transaction.transaction_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {transaction.display_account || (transaction.bank_accounts?.account_name + ' - ' + transaction.bank_accounts?.bank_name)}
                        </span>
                        <Badge variant={getBadgeVariant(transaction.transaction_type)}>
                          {transaction.transaction_type}
                        </Badge>
                        {transaction.display_client && (
                          <Badge variant="outline" className="text-xs">
                            Client: {transaction.display_client}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}{' '}
                        <span className="text-xs">
                          {format(new Date(transaction.created_at), "HH:mm:ss")}
                        </span>
                      </div>
                      {transaction.description && (
                        <div className="text-sm text-muted-foreground">{transaction.description}</div>
                      )}
                      {transaction.category && (
                        <div className="text-xs text-muted-foreground/70">
                          Category: {transaction.category}
                        </div>
                      )}
                      {transaction.reference_number && (
                        <div className="text-xs text-muted-foreground/70">
                          Ref: {transaction.reference_number}
                        </div>
                      )}
                      {transaction.created_by_user && (
                        <div className="text-xs text-primary font-medium">
                          By: {transaction.created_by_user.first_name || transaction.created_by_user.username}
                        </div>
                      )}
                    </div>
                  </div>
                   <div className="flex items-center gap-2">
                     <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-8 w-8"
                         onClick={() => handleEditClick(transaction)}
                       >
                         <Pencil className="h-4 w-4" />
                       </Button>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-8 w-8 text-destructive hover:text-destructive"
                         onClick={() => handleDeleteClick(transaction)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </PermissionGate>
                     <div className="text-right">
                    <div className={`font-semibold text-lg ${getTransactionColor(transaction.transaction_type)}`}>
                      {transaction.transaction_type === 'EXPENSE' ? '-' : '+'}
                      ₹{parseFloat(transaction.amount.toString()).toLocaleString()}
                    </div>
                       <div className="text-xs text-muted-foreground">
                         {transaction.created_by_user 
                           ? `By: ${transaction.created_by_user.username || transaction.created_by_user.first_name}`
                           : 'System'}
                       </div>
                       <div className="text-xs text-muted-foreground">
                         {format(new Date(transaction.created_at), "MMM dd, yyyy HH:mm:ss")}
                       </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
 
       {/* Delete Confirmation Dialog */}
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete this {transactionToDelete?.transaction_type?.toLowerCase()} entry of ₹{transactionToDelete?.amount?.toLocaleString()}? 
               This will reverse the bank balance adjustment. This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction 
               onClick={confirmDelete}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {deleteTransactionMutation.isPending ? "Deleting..." : "Delete"}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
 
       {/* Edit Dialog */}
       <EditExpenseDialog
         open={editDialogOpen}
         onOpenChange={setEditDialogOpen}
         transaction={transactionToEdit}
         bankAccounts={bankAccounts || []}
       />
    </div>
  );
}