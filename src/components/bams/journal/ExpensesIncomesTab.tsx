
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ExpensesIncomesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    type: "",
    amount: "",
    bankAccountId: "",
    category: "",
    date: undefined as Date | undefined,
    description: ""
  });

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

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (transactionData: typeof formData) => {
      const { error } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: transactionData.bankAccountId,
          transaction_type: transactionData.type,
          amount: parseFloat(transactionData.amount),
          category: transactionData.category,
          description: transactionData.description,
          transaction_date: transactionData.date,
          reference_number: `${transactionData.type}-${Date.now()}`
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${formData.type === 'INCOME' ? 'Income' : 'Expense'} entry added successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      setFormData({
        type: "",
        amount: "",
        bankAccountId: "",
        category: "",
        date: undefined,
        description: ""
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add transaction",
        variant: "destructive"
      });
    },
  });

  const incomeCategories = ["Salary", "Interest", "Commission", "Profit", "Other Income"];
  const expenseCategories = ["Rent", "Utilities", "Office Supplies", "Marketing", "Travel", "Other Expense"];

  const handleAddEntry = () => {
    if (!formData.type || !formData.amount || !formData.bankAccountId || !formData.category || !formData.date) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    createTransactionMutation.mutate(formData);
  };

  const totalIncomes = transactions
    ?.filter(t => t.transaction_type === "INCOME")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;

  const totalExpenses = transactions
    ?.filter(t => t.transaction_type === "EXPENSE")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Entry Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Income/Expense Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="type">Transaction Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value, category: ""})}>
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
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="bankAccount">Bank Account</Label>
              <Select value={formData.bankAccountId} onValueChange={(value) => setFormData({...formData, bankAccountId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                      <span className="text-sm text-gray-500 ml-2">
                        (₹{parseFloat(account.balance).toLocaleString()})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {formData.type === "INCOME" 
                    ? incomeCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))
                    : expenseCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Date</Label>
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
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Transaction description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="flex items-end">
              <Button 
                onClick={handleAddEntry} 
                className="w-full"
                disabled={createTransactionMutation.isPending}
              >
                {createTransactionMutation.isPending ? "Adding..." : "Add Entry"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Total Incomes</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">₹{totalIncomes.toLocaleString()}</div>
            <p className="text-xs text-green-600">
              {transactions?.filter(t => t.transaction_type === "INCOME").length || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">₹{totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-red-600">
              {transactions?.filter(t => t.transaction_type === "EXPENSE").length || 0} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net Balance */}
      <Card className={cn(
        "border-2",
        totalIncomes - totalExpenses >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      )}>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className={cn(
              "text-3xl font-bold",
              totalIncomes - totalExpenses >= 0 ? "text-green-700" : "text-red-700"
            )}>
              ₹{(totalIncomes - totalExpenses).toLocaleString()}
            </div>
            <p className="text-sm text-gray-600 mt-1">Net Balance</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
