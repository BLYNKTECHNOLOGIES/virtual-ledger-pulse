 import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validateBankAccountBalance, ValidationError } from "@/utils/validations";
import { useAuth } from "@/hooks/useAuth";
 import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getSubCategories, getFullCategoryLabel } from "@/data/expenseCategories";
 import { isUuid } from "@/utils/isUuid";

interface TransactionFormProps {
  bankAccounts: any[];
}

export function TransactionForm({ bankAccounts }: TransactionFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    bankAccountId: "",
    transactionType: "",
    amount: "",
    category: "",
     subCategory: "",
    description: "",
    date: undefined as Date | undefined,
    referenceNumber: "",
  });

   // Get main categories based on transaction type
   const mainCategories = formData.transactionType === 'INCOME' 
    ? INCOME_CATEGORIES 
    : EXPENSE_CATEGORIES;
 
   // Get sub-categories based on selected category
   const subCategories = useMemo(() => {
     if (!formData.category) return [];
     return getSubCategories(formData.category);
   }, [formData.category]);

  const createTransactionMutation = useMutation({
    mutationFn: async (transactionData: typeof formData) => {
      const amount = parseFloat(transactionData.amount);

      // Validate bank account balance for expense transactions
      if (transactionData.transactionType === 'EXPENSE') {
        try {
          await validateBankAccountBalance(transactionData.bankAccountId, amount);
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error;
          }
          throw new Error('Failed to validate bank account balance');
        }
      }

       // Get full category label for storage (Category > SubCategory)
       const categoryLabel = transactionData.category && transactionData.subCategory
         ? getFullCategoryLabel(transactionData.category, transactionData.subCategory)
        : null;

       // Only use user.id if it's a valid UUID, otherwise set to null
       const createdBy = user?.id && isUuid(user.id) ? user.id : null;
 
      const { data, error } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: transactionData.bankAccountId,
          transaction_type: transactionData.transactionType,
          amount: amount,
          category: categoryLabel,
           description: transactionData.description || null,
          transaction_date: transactionData.date ? format(transactionData.date, 'yyyy-MM-dd') : null,
          reference_number: transactionData.referenceNumber || null,
           created_by: createdBy,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transaction recorded successfully. Bank balance updated automatically.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_manual_only'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      setFormData({
        bankAccountId: "",
        transactionType: "",
        amount: "",
        category: "",
         subCategory: "",
        description: "",
        date: undefined,
        referenceNumber: "",
      });
    },
    onError: (error: any) => {
      const message = error instanceof ValidationError ? error.message : (error.message || "Failed to record transaction");
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    },
  });

  const handleSubmit = () => {
     // Validate required fields
     if (!formData.bankAccountId || !formData.transactionType || !formData.amount || !formData.date) {
      toast({
        title: "Error",
         description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

     // Category and sub-category are required when transaction type is selected
     if (formData.transactionType && (!formData.category || !formData.subCategory)) {
      toast({
        title: "Error",
         description: "Please select both category and sub-category",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(formData.amount);
    if (amount <= 0) {
      toast({
        title: "Error",
        description: "Amount must be greater than 0",
        variant: "destructive"
      });
      return;
    }

    createTransactionMutation.mutate(formData);
  };

   // Reset category and sub-category when transaction type changes
  const handleTransactionTypeChange = (value: string) => {
    setFormData({
      ...formData, 
      transactionType: value,
       category: "",
       subCategory: ""
    });
  };
 
   // Reset sub-category when category changes
   const handleCategoryChange = (value: string) => {
     setFormData({
       ...formData,
       category: value,
       subCategory: ""
     });
   };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {formData.transactionType === 'INCOME' ? (
            <TrendingUp className="h-5 w-5 text-green-600" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-600" />
          )}
          Record Transaction
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="bankAccount">Bank Account *</Label>
            <Select value={formData.bankAccountId} onValueChange={(value) => setFormData({...formData, bankAccountId: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.filter(account => !account.dormant_at).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name}
                    <span className="text-sm text-muted-foreground ml-2">
                      (₹{parseFloat(account.balance.toString()).toLocaleString()})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="transactionType">Transaction Type *</Label>
            <Select value={formData.transactionType} onValueChange={handleTransactionTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="EXPENSE">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select 
              value={formData.category} 
               onValueChange={handleCategoryChange}
              disabled={!formData.transactionType}
            >
              <SelectTrigger>
                <SelectValue placeholder={formData.transactionType ? "Select category" : "Select type first"} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                 {mainCategories.map((category) => (
                   <SelectItem key={category.value} value={category.value}>
                     {category.label}
                   </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
             <Label htmlFor="subCategory">Sub-Category *</Label>
             <Select 
               value={formData.subCategory} 
               onValueChange={(value) => setFormData({...formData, subCategory: value})}
               disabled={!formData.category}
             >
               <SelectTrigger>
                 <SelectValue placeholder={formData.category ? "Select sub-category" : "Select category first"} />
               </SelectTrigger>
               <SelectContent className="max-h-[300px]">
                 {subCategories.map((subCategory) => (
                   <SelectItem key={subCategory.value} value={subCategory.value}>
                     {subCategory.label}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div>
            <Label htmlFor="amount">Amount (₹) *</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
            />
          </div>

          <div>
            <Label>Transaction Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.date ? format(formData.date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.date}
                  onSelect={(date) => setFormData({...formData, date})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

           <div>
            <Label htmlFor="referenceNumber">Reference Number</Label>
            <Input
              id="referenceNumber"
              placeholder="e.g., CHQ001, TXN123"
              value={formData.referenceNumber}
              onChange={(e) => setFormData({...formData, referenceNumber: e.target.value})}
            />
          </div>

           <div className="lg:col-span-3">
             <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
               placeholder="Describe the transaction..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

           <div className="lg:col-span-3 mt-2">
            <Button 
              onClick={handleSubmit} 
              className="w-full"
              disabled={createTransactionMutation.isPending}
            >
              {createTransactionMutation.isPending ? "Recording..." : "Record Transaction"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
