
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PurchasePaymentMethod, BankAccount, PurchaseMethodFormData } from "./types";

export function usePurchaseMethods() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch purchase payment methods from database
  const { data: purchasePaymentMethods, isLoading } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          bank_accounts!bank_account_id (
            account_name,
            bank_name,
            account_number,
            balance
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PurchasePaymentMethod[];
    },
  });

  // Fetch active bank accounts for dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['active_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number, IFSC, balance, status')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  // Create payment method mutation
  const createMethodMutation = useMutation({
    mutationFn: async (methodData: PurchaseMethodFormData) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .insert({
          type: methodData.type,
          bank_account_id: methodData.bank_account_id,
          payment_limit: parseFloat(methodData.payment_limit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          is_active: methodData.is_active
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Created",
        description: "New purchase payment method has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase payment method",
        variant: "destructive",
      });
    },
  });

  // Update payment method mutation
  const updateMethodMutation = useMutation({
    mutationFn: async (methodData: PurchaseMethodFormData & { id: string }) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .update({
          type: methodData.type,
          bank_account_id: methodData.bank_account_id,
          payment_limit: parseFloat(methodData.payment_limit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          is_active: methodData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', methodData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Updated",
        description: "Purchase payment method has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase payment method",
        variant: "destructive",
      });
    },
  });

  // Delete payment method mutation
  const deleteMethodMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Deleted",
        description: "Purchase payment method has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase payment method",
        variant: "destructive",
      });
    },
  });

  return {
    purchasePaymentMethods,
    bankAccounts,
    isLoading,
    createMethodMutation,
    updateMethodMutation,
    deleteMethodMutation,
  };
}
