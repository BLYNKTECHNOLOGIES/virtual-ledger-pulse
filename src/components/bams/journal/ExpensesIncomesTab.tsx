
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  type: "Income" | "Expense";
  amount: number;
  bankAccount: string;
  category: string;
  date: Date;
}

export function ExpensesIncomesTab() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [formData, setFormData] = useState({
    type: "",
    amount: "",
    bankAccount: "",
    category: "",
    date: undefined as Date | undefined
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

  const incomeCategories = ["Salary", "Interest", "Commission", "Profit", "Other Income"];
  const expenseCategories = ["Rent", "Utilities", "Office Supplies", "Marketing", "Travel", "Other Expense"];

  const handleAddEntry = () => {
    if (!formData.type || !formData.amount || !formData.bankAccount || !formData.category || !formData.date) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const newTransaction: Transaction = {
      id: Date.now().toString(),
      type: formData.type as "Income" | "Expense",
      amount: parseFloat(formData.amount),
      bankAccount: formData.bankAccount,
      category: formData.category,
      date: formData.date
    };

    setTransactions([...transactions, newTransaction]);
    setFormData({
      type: "",
      amount: "",
      bankAccount: "",
      category: "",
      date: undefined
    });

    toast({
      title: "Success",
      description: `${formData.type} entry added successfully`,
    });
  };

  const totalIncomes = transactions
    .filter(t => t.type === "Income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.type === "Expense")
    .reduce((sum, t) => sum + t.amount, 0);

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
                  <SelectItem value="Income">Income</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
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
              <Select value={formData.bankAccount} onValueChange={(value) => setFormData({...formData, bankAccount: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.account_name}>
                      {account.account_name} - {account.bank_name}
                      <span className="text-sm text-gray-500 ml-2">
                        (₹{account.balance.toLocaleString()})
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
                  {formData.type === "Income" 
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

            <div className="flex items-end">
              <Button onClick={handleAddEntry} className="w-full">
                Add Entry
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
              {transactions.filter(t => t.type === "Income").length} transactions
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
              {transactions.filter(t => t.type === "Expense").length} transactions
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
