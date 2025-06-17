
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft, Download, CalendarIcon, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DirectoryFilters {
  amountMin?: number;
  amountMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
  transactionType?: string;
  bankAccountId?: string;
}

export function DirectoryTab() {
  const [filters, setFilters] = useState<DirectoryFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  // Fetch bank accounts for filter dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_for_filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('status', 'ACTIVE');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch all transactions (bank, sales, purchases)
  const { data: allTransactions, isLoading } = useQuery({
    queryKey: ['all_transactions', filters],
    queryFn: async () => {
      // Bank transactions
      let bankQuery = supabase
        .from('bank_transactions')
        .select(`
          id,
          amount,
          transaction_date,
          transaction_type,
          description,
          category,
          reference_number,
          related_account_name,
          created_at,
          bank_accounts!bank_account_id(account_name, bank_name, id)
        `)
        .order('transaction_date', { ascending: false });

      // Apply filters
      if (filters.amountMin) {
        bankQuery = bankQuery.gte('amount', filters.amountMin);
      }
      if (filters.amountMax) {
        bankQuery = bankQuery.lte('amount', filters.amountMax);
      }
      if (filters.dateFrom) {
        bankQuery = bankQuery.gte('transaction_date', format(filters.dateFrom, 'yyyy-MM-dd'));
      }
      if (filters.dateTo) {
        bankQuery = bankQuery.lte('transaction_date', format(filters.dateTo, 'yyyy-MM-dd'));
      }
      if (filters.transactionType) {
        bankQuery = bankQuery.eq('transaction_type', filters.transactionType);
      }
      if (filters.bankAccountId) {
        bankQuery = bankQuery.eq('bank_account_id', filters.bankAccountId);
      }

      const { data: bankData, error: bankError } = await bankQuery;
      if (bankError) throw bankError;

      // Sales orders
      let salesQuery = supabase
        .from('sales_orders')
        .select(`
          id,
          amount,
          order_date,
          order_number,
          client_name,
          description,
          status,
          created_at,
          sales_payment_methods(type, bank_accounts(account_name, bank_name, id))
        `)
        .order('order_date', { ascending: false });

      // Apply date filters to sales
      if (filters.dateFrom) {
        salesQuery = salesQuery.gte('order_date', format(filters.dateFrom, 'yyyy-MM-dd'));
      }
      if (filters.dateTo) {
        salesQuery = salesQuery.lte('order_date', format(filters.dateTo, 'yyyy-MM-dd'));
      }
      if (filters.amountMin) {
        salesQuery = salesQuery.gte('amount', filters.amountMin);
      }
      if (filters.amountMax) {
        salesQuery = salesQuery.lte('amount', filters.amountMax);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // Purchase orders
      let purchaseQuery = supabase
        .from('purchase_orders')
        .select(`
          id,
          total_amount,
          order_date,
          order_number,
          supplier_name,
          description,
          status,
          created_at,
          purchase_payment_methods(type, bank_account_name),
          bank_accounts(account_name, bank_name, id)
        `)
        .order('order_date', { ascending: false });

      // Apply date filters to purchases
      if (filters.dateFrom) {
        purchaseQuery = purchaseQuery.gte('order_date', format(filters.dateFrom, 'yyyy-MM-dd'));
      }
      if (filters.dateTo) {
        purchaseQuery = purchaseQuery.lte('order_date', format(filters.dateTo, 'yyyy-MM-dd'));
      }
      if (filters.amountMin) {
        purchaseQuery = purchaseQuery.gte('total_amount', filters.amountMin);
      }
      if (filters.amountMax) {
        purchaseQuery = purchaseQuery.lte('total_amount', filters.amountMax);
      }

      const { data: purchaseData, error: purchaseError } = await purchaseQuery;
      if (purchaseError) throw purchaseError;

      // Combine and format all transactions
      const combinedTransactions = [
        ...(bankData || []).map(t => ({
          ...t,
          source: 'BANK',
          display_amount: t.amount,
          display_date: t.transaction_date,
          display_type: t.transaction_type,
          display_description: t.description || '',
          display_reference: t.reference_number || '',
          display_account: t.bank_accounts?.account_name + ' - ' + t.bank_accounts?.bank_name,
          bank_account_id: t.bank_accounts?.id
        })),
        ...(salesData || []).map(s => ({
          ...s,
          source: 'SALES',
          display_amount: s.amount,
          display_date: s.order_date,
          display_type: 'SALES_ORDER',
          display_description: `Sales Order - ${s.client_name}${s.description ? ': ' + s.description : ''}`,
          display_reference: s.order_number,
          display_account: s.sales_payment_methods?.bank_accounts?.account_name ? 
            s.sales_payment_methods.bank_accounts.account_name + ' - ' + s.sales_payment_methods.bank_accounts.bank_name : 
            s.sales_payment_methods?.type || '',
          bank_account_id: s.sales_payment_methods?.bank_accounts?.id
        })),
        ...(purchaseData || []).map(p => ({
          ...p,
          source: 'PURCHASE',
          display_amount: p.total_amount,
          display_date: p.order_date,
          display_type: 'PURCHASE_ORDER',
          display_description: `Purchase Order - ${p.supplier_name}${p.description ? ': ' + p.description : ''}`,
          display_reference: p.order_number,
          display_account: p.bank_accounts?.account_name ? 
            p.bank_accounts.account_name + ' - ' + p.bank_accounts.bank_name : 
            p.purchase_payment_methods?.bank_account_name || '',
          bank_account_id: p.bank_accounts?.id
        }))
      ];

      // Apply additional filters
      let filteredTransactions = combinedTransactions;

      if (filters.transactionType) {
        filteredTransactions = filteredTransactions.filter(t => t.display_type === filters.transactionType);
      }

      if (filters.bankAccountId) {
        filteredTransactions = filteredTransactions.filter(t => t.bank_account_id === filters.bankAccountId);
      }

      // Sort by date
      return filteredTransactions.sort((a, b) => 
        new Date(b.display_date).getTime() - new Date(a.display_date).getTime()
      );
    },
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
      case 'SALES_ORDER':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'INCOME':
      case 'SALES_ORDER':
        return 'text-green-700';
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
        return 'text-red-700';
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return 'text-blue-700';
      default:
        return 'text-gray-700';
    }
  };

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'INCOME':
      case 'SALES_ORDER':
        return 'default';
      case 'EXPENSE':
      case 'PURCHASE_ORDER':
        return 'destructive';
      case 'TRANSFER_IN':
      case 'TRANSFER_OUT':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const clearFilters = () => {
    setFilters({});
  };

  const downloadCSV = () => {
    if (!allTransactions || allTransactions.length === 0) return;

    const csvHeaders = [
      'Source',
      'Type',
      'Date',
      'Amount',
      'Description',
      'Reference',
      'Account',
      'Created At'
    ];

    const csvData = allTransactions.map(transaction => [
      transaction.source,
      transaction.display_type.replace('_', ' '),
      format(new Date(transaction.display_date), 'MMM dd, yyyy'),
      transaction.display_amount,
      transaction.display_description,
      transaction.display_reference,
      transaction.display_account,
      format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="text-center py-8 text-gray-500">
            Loading transactions...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-blue-600" />
              Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
              <Button variant="outline" onClick={downloadCSV} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download Data
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Amount Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount Range</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.amountMin || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, amountMin: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.amountMax || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, amountMax: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Date From</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateFrom ? format(filters.dateFrom, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(date) => setFilters(prev => ({ ...prev, dateFrom: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date To</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filters.dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateTo ? format(filters.dateTo, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(date) => setFilters(prev => ({ ...prev, dateTo: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Transaction Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction Type</label>
                <Select value={filters.transactionType || ''} onValueChange={(value) => setFilters(prev => ({ ...prev, transactionType: value || undefined }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    <SelectItem value="INCOME">Income</SelectItem>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                    <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                    <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                    <SelectItem value="SALES_ORDER">Sales Order</SelectItem>
                    <SelectItem value="PURCHASE_ORDER">Purchase Order</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bank Account */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Bank Account</label>
                <Select value={filters.bankAccountId || ''} onValueChange={(value) => setFilters(prev => ({ ...prev, bankAccountId: value || undefined }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All accounts</SelectItem>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} - {account.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={clearFilters} className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Transactions List */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            All Transactions Directory
            <Badge variant="secondary">{allTransactions?.length || 0} entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!allTransactions || allTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found
            </div>
          ) : (
            <div className="space-y-4">
              {allTransactions.map((transaction) => (
                <div
                  key={`${transaction.source}-${transaction.id}`}
                  className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-full">
                      {getTransactionIcon(transaction.display_type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{transaction.display_account}</span>
                        <Badge variant={getBadgeVariant(transaction.display_type)}>
                          {transaction.display_type.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline">{transaction.source}</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(transaction.display_date), "MMM dd, yyyy")}
                      </div>
                      {transaction.display_description && (
                        <div className="text-sm text-gray-500">{transaction.display_description}</div>
                      )}
                      {transaction.display_reference && (
                        <div className="text-xs text-gray-400">
                          Ref: {transaction.display_reference}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-lg ${getTransactionColor(transaction.display_type)}`}>
                      {transaction.display_type === 'EXPENSE' || transaction.display_type === 'TRANSFER_OUT' || transaction.display_type === 'PURCHASE_ORDER' ? '-' : '+'}
                      ₹{parseFloat(transaction.display_amount.toString()).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(transaction.created_at), "HH:mm")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
