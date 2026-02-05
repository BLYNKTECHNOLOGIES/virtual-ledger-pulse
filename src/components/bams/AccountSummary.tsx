import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  FileText, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  BarChart3,
  PieChart,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter
} from "lucide-react";
import { toast } from "sonner";

interface AccountSummaryData {
  account_name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  bank_account_holder_name: string;
  branch: string;
  status: string;
  stored_balance: number;
  computed_balance: number;
  total_transactions: number;
  total_income: number;
  total_expense: number;
  account_created: string;
  last_updated: string;
}

interface SystemTotals {
  total_accounts: number;
  active_accounts: number;
  inactive_accounts: number;
  dormant_accounts: number;
  total_stored_balance: number;
  first_account_created: string;
  last_account_updated: string;
}

interface TransactionWithBalance {
  id: string;
  transaction_date: string;
  created_at: string;
  bank_account_id: string;
  account_name: string;
  bank_name: string;
  transaction_type: string;
  amount: number;
  description: string;
  category: string;
  reference_number: string;
  related_account_name: string;
  closing_balance: number;
  total_count: number;
}

interface BankAccountOption {
  id: string;
  account_name: string;
  bank_name: string;
}

interface CaseData {
  case_number: string;
  case_type: string;
  title: string;
  status: string;
  priority: string;
  amount_involved: number;
  created_at: string;
  resolved_at: string;
  investigation_status: string;
  account_name: string;
  bank_name: string;
}

export function AccountSummary() {
  const [activeReportTab, setActiveReportTab] = useState("overview");
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>("all");
  const [transactionPage, setTransactionPage] = useState(0);
  const TRANSACTIONS_PER_PAGE = 25;
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch account summary data directly from bank_accounts table (not computed view)
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at');
      
      if (error) throw error;
      
      // Get transaction summaries for each account
      const accountsWithTransactions = await Promise.all(
        data.map(async (account) => {
          const { data: transactions, error: txError } = await supabase
            .from('bank_transactions')
            .select('transaction_type, amount')
            .eq('bank_account_id', account.id);
          
          if (txError) throw txError;
          
          const total_income = transactions
            .filter(t => t.transaction_type === 'INCOME' || t.transaction_type === 'CREDIT')
            .reduce((sum, t) => sum + t.amount, 0);
          
          const total_expense = transactions
            .filter(t => t.transaction_type === 'EXPENSE' || t.transaction_type === 'DEBIT')
            .reduce((sum, t) => sum + t.amount, 0);
          
          return {
            account_name: account.account_name,
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_type: account.account_type,
            bank_account_holder_name: account.bank_account_holder_name,
            branch: account.branch,
            status: account.status,
            stored_balance: account.balance,
            computed_balance: account.balance, // Use direct balance from bank_accounts table
            total_transactions: transactions.length,
            total_income,
            total_expense,
            account_created: account.created_at,
            last_updated: account.updated_at
          };
        })
      );
      
      return accountsWithTransactions as AccountSummaryData[];
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Fetch system totals (exclude dormant from active balance calculations)
  const { data: systemTotals } = useQuery({
    queryKey: ['system-totals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('status, balance, created_at, updated_at, dormant_at');
      
      if (error) throw error;
      
      const total_accounts = data.length;
      const active_accounts = data.filter(a => a.status === 'ACTIVE' && !a.dormant_at).length;
      const inactive_accounts = data.filter(a => a.status === 'INACTIVE').length;
      const dormant_accounts = data.filter(a => a.dormant_at || a.status === 'DORMANT').length;
      
      // Only include non-dormant active accounts in balance calculation
      const total_stored_balance = data
        .filter(a => a.status === 'ACTIVE' && !a.dormant_at)
        .reduce((sum, a) => sum + a.balance, 0);
      
      const first_account_created = data.reduce((earliest, a) => 
        new Date(a.created_at) < new Date(earliest) ? a.created_at : earliest, 
        data[0]?.created_at || new Date().toISOString()
      );
      const last_account_updated = data.reduce((latest, a) => 
        new Date(a.updated_at) > new Date(latest) ? a.updated_at : latest, 
        data[0]?.updated_at || new Date().toISOString()
      );
      
      return {
        total_accounts,
        active_accounts,
        inactive_accounts,
        dormant_accounts,
        total_stored_balance,
        first_account_created,
        last_account_updated
      } as SystemTotals;
    },
  });

  // Fetch bank accounts for filter dropdown
  const { data: bankAccountOptions } = useQuery({
    queryKey: ['bank-accounts-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data as BankAccountOption[];
    },
  });

  // Fetch transactions with closing balance using RPC
  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions-with-balance', selectedBankFilter, transactionPage],
    queryFn: async () => {
      const bankAccountId = selectedBankFilter === 'all' ? null : selectedBankFilter;
      
      const { data, error } = await supabase.rpc('get_transactions_with_closing_balance', {
        p_bank_account_id: bankAccountId,
        p_limit: TRANSACTIONS_PER_PAGE,
        p_offset: transactionPage * TRANSACTIONS_PER_PAGE
      });
      
      if (error) throw error;
      return data as TransactionWithBalance[];
    },
  });

  // Fetch cases data
  const { data: casesData } = useQuery({
    queryKey: ['cases-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_cases')
        .select(`
          case_number,
          case_type,
          title,
          status,
          priority,
          amount_involved,
          created_at,
          resolved_at,
          investigation_status,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(c => ({
        ...c,
        account_name: c.bank_accounts?.account_name,
        bank_name: c.bank_accounts?.bank_name
      })) as CaseData[];
    },
  });

  const handleExportPDF = async () => {
    try {
      // Create a new window with the content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error("Please allow popups to export PDF");
        return;
      }

      // Get the content to export
      const content = printRef.current?.innerHTML || '';
      
      // Create a complete HTML document for PDF generation
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Account Summary Report - ${format(new Date(), 'dd MMM yyyy')}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
              .header h1 { color: #1f2937; margin: 0; }
              .header p { color: #6b7280; margin: 5px 0 0 0; }
              .metric-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 10px 0; display: inline-block; width: 200px; }
              .metric-value { font-size: 24px; font-weight: bold; color: #1f2937; }
              .metric-label { font-size: 14px; color: #6b7280; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
              th { background-color: #f8fafc; font-weight: 600; }
              .badge { background-color: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
              .text-green { color: #059669; }
              .text-red { color: #dc2626; }
              .text-blue { color: #2563eb; }
              .print-hidden { display: none; }
              @media print {
                body { margin: 0; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>BAMS - Banking & Payment Management</h1>
              <p>Account Summary & Reports</p>
              <p>Generated on ${format(new Date(), 'EEEE, MMMM dd, yyyy HH:mm')}</p>
            </div>
            ${content.replace(/print:hidden/g, 'print-hidden')}
          </body>
        </html>
      `;

      // Write content and trigger print dialog
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      };
      
      toast.success("PDF export initiated - use your browser's print dialog to save as PDF");
    } catch (error) {
      console.error('Export error:', error);
      toast.error("Failed to export PDF. Please try again.");
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'default';
      case 'INACTIVE': return 'secondary';
      case 'RESOLVED': return 'default';
      case 'OPEN': return 'destructive';
      default: return 'secondary';
    }
  };

  const getCaseTypeColor = (type: string) => {
    switch (type) {
      case 'ACCOUNT_NOT_WORKING': return 'bg-red-100 text-red-700';
      case 'BALANCE_DISCREPANCY': return 'bg-purple-100 text-purple-700';
      case 'WRONG_PAYMENT_INITIATED': return 'bg-orange-100 text-orange-700';
      case 'SETTLEMENT_NOT_RECEIVED': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading account summary...</p>
        </div>
      </div>
    );
  }

  const totalComputedBalance = accountsData?.reduce((sum, acc) => sum + acc.computed_balance, 0) || 0;
  const totalIncome = accountsData?.reduce((sum, acc) => sum + acc.total_income, 0) || 0;
  const totalExpense = accountsData?.reduce((sum, acc) => sum + acc.total_expense, 0) || 0;

  return (
    <div ref={printRef} className="space-y-6 print:space-y-4">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Summary & Reports</h1>
          <p className="text-gray-600 mt-1">Comprehensive banking system analysis and reporting</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button onClick={handleExportPDF} variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeReportTab} onValueChange={setActiveReportTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 print:hidden">
          <TabsTrigger value="overview">System Overview</TabsTrigger>
          <TabsTrigger value="accounts">Account Details</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="cases">Cases & Issues</TabsTrigger>
        </TabsList>

        {/* System Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Building2 className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Accounts</p>
                    <p className="text-2xl font-bold text-gray-900">{systemTotals?.total_accounts || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Balance</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalComputedBalance)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Active Accounts</p>
                    <p className="text-2xl font-bold text-gray-900">{systemTotals?.active_accounts || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Inactive Accounts</p>
                    <p className="text-2xl font-bold text-gray-900">{systemTotals?.inactive_accounts || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Financial Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Total Income</span>
                  </div>
                  <span className="font-bold text-green-600">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Total Expense</span>
                  </div>
                  <span className="font-bold text-red-600">{formatCurrency(totalExpense)}</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Net Position</span>
                    <span className={`font-bold ${totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totalIncome - totalExpense)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Account Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm">Active Accounts</span>
                    </div>
                    <span className="font-semibold">{systemTotals?.active_accounts || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                      <span className="text-sm">Inactive Accounts</span>
                    </div>
                    <span className="font-semibold">{systemTotals?.inactive_accounts || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Account Details Tab */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Account Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Account Name</th>
                      <th className="text-left p-2">Bank</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Balance</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Transactions</th>
                      <th className="text-left p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountsData?.map((account, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{account.account_name}</td>
                        <td className="p-2">{account.bank_name}</td>
                        <td className="p-2">
                          <Badge variant="outline">{account.account_type}</Badge>
                        </td>
                        <td className="p-2 font-mono">{formatCurrency(account.computed_balance)}</td>
                        <td className="p-2">
                          <Badge variant={getStatusBadgeVariant(account.status)}>
                            {account.status}
                          </Badge>
                        </td>
                        <td className="p-2">{account.total_transactions}</td>
                        <td className="p-2">{format(new Date(account.account_created), 'dd MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Transaction History
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {transactionsData?.[0]?.total_count 
                      ? `${transactionsData[0].total_count.toLocaleString()} total transactions`
                      : 'Loading...'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select 
                    value={selectedBankFilter} 
                    onValueChange={(value) => {
                      setSelectedBankFilter(value);
                      setTransactionPage(0); // Reset to first page when filter changes
                    }}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Select Bank Account" />
                    </SelectTrigger>
                    <SelectContent className="z-[100] bg-popover border shadow-md">
                      <SelectItem value="all">All Bank Accounts</SelectItem>
                      {bankAccountOptions?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.account_name} ({account.bank_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Activity className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading transactions...</span>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-semibold">Date & Time</th>
                          <th className="text-left p-3 font-semibold">Account</th>
                          <th className="text-left p-3 font-semibold">Type</th>
                          <th className="text-right p-3 font-semibold">Amount</th>
                          <th className="text-right p-3 font-semibold">Closing Balance</th>
                          <th className="text-left p-3 font-semibold">Description</th>
                          <th className="text-left p-3 font-semibold">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionsData?.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-muted-foreground">
                              No transactions found for the selected filter.
                            </td>
                          </tr>
                        ) : (
                          transactionsData?.map((transaction) => (
                            <tr key={transaction.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="p-3">
                                <div className="font-medium">{format(new Date(transaction.transaction_date), 'dd MMM yyyy')}</div>
                                <div className="text-xs text-muted-foreground">{format(new Date(transaction.created_at), 'HH:mm:ss')}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-medium">{transaction.account_name}</div>
                                <div className="text-xs text-muted-foreground">{transaction.bank_name}</div>
                              </td>
                              <td className="p-3">
                                <Badge 
                                  variant={transaction.transaction_type === 'INCOME' || transaction.transaction_type === 'CREDIT' ? 'default' : 'secondary'}
                                  className={
                                    transaction.transaction_type === 'INCOME' || transaction.transaction_type === 'CREDIT'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }
                                >
                                  {transaction.transaction_type}
                                </Badge>
                              </td>
                              <td className="p-3 text-right font-mono font-semibold">
                                <span className={
                                  transaction.transaction_type === 'INCOME' || transaction.transaction_type === 'CREDIT' 
                                    ? 'text-green-600 dark:text-green-400' 
                                    : 'text-red-600 dark:text-red-400'
                                }>
                                  {transaction.transaction_type === 'INCOME' || transaction.transaction_type === 'CREDIT' ? '+' : '-'}
                                  {formatCurrency(transaction.amount)}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-semibold text-foreground">
                                {formatCurrency(transaction.closing_balance)}
                              </td>
                              <td className="p-3 max-w-[200px] truncate" title={transaction.description || ''}>
                                {transaction.description || '-'}
                              </td>
                              <td className="p-3 font-mono text-xs text-muted-foreground">
                                {transaction.reference_number || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {transactionsData && transactionsData[0]?.total_count > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {transactionPage * TRANSACTIONS_PER_PAGE + 1} - {Math.min((transactionPage + 1) * TRANSACTIONS_PER_PAGE, transactionsData[0]?.total_count || 0)} of {transactionsData[0]?.total_count.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTransactionPage(prev => Math.max(0, prev - 1))}
                          disabled={transactionPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <span className="text-sm px-2">
                          Page {transactionPage + 1} of {Math.ceil((transactionsData[0]?.total_count || 1) / TRANSACTIONS_PER_PAGE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTransactionPage(prev => prev + 1)}
                          disabled={(transactionPage + 1) * TRANSACTIONS_PER_PAGE >= (transactionsData[0]?.total_count || 0)}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Banking Cases & Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Case Number</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2">Account</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Amount</th>
                      <th className="text-left p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casesData?.map((caseItem) => (
                      <tr key={caseItem.case_number} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-mono">{caseItem.case_number}</td>
                        <td className="p-2">
                          <Badge className={getCaseTypeColor(caseItem.case_type)}>
                            {caseItem.case_type.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-2 font-medium">{caseItem.title}</td>
                        <td className="p-2">
                          <div>
                            <div className="font-medium">{caseItem.account_name}</div>
                            <div className="text-xs text-gray-500">{caseItem.bank_name}</div>
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge variant={getStatusBadgeVariant(caseItem.status)}>
                            {caseItem.status}
                          </Badge>
                        </td>
                        <td className="p-2 font-mono">
                          {caseItem.amount_involved > 0 ? formatCurrency(caseItem.amount_involved) : '-'}
                        </td>
                        <td className="p-2">{format(new Date(caseItem.created_at), 'dd MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Print Footer */}
      <div className="hidden print:block text-center text-xs text-gray-500 mt-8 border-t pt-4">
        Generated on {format(new Date(), 'PPpp')} | BAMS - Banking & Payment Management System
      </div>
    </div>
  );
}