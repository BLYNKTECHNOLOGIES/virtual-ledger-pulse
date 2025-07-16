import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRightLeft, Download, Filter, CalendarIcon, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function DirectoryTab() {
  // Filter states
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("all");
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch bank accounts for filter dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('status', 'ACTIVE')
        .order('account_name');
      if (error) throw error;
      return data;
    },
  });
  // Fetch all transactions (bank, sales, purchases)
  const { data: allTransactions, isLoading } = useQuery({
    queryKey: ['all_transactions'],
    queryFn: async () => {
      // Bank transactions
      const { data: bankData, error: bankError } = await supabase
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
          bank_accounts!bank_account_id(account_name, bank_name, id, account_number)
        `)
        .order('transaction_date', { ascending: false });

      if (bankError) throw bankError;

      // Sales orders - using correct column names from new table structure
      const { data: salesData, error: salesError } = await supabase
        .from('sales_orders')
        .select(`
          id,
          total_amount,
          order_date,
          order_number,
          client_name,
          description,
          status,
          created_at,
          sales_payment_methods(type, bank_accounts(account_name, bank_name, id, account_number))
        `)
        .order('order_date', { ascending: false });

      if (salesError) throw salesError;

      // Purchase orders with bank account details
      const { data: purchaseData, error: purchaseError } = await supabase
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
          bank_accounts!bank_account_id(account_name, bank_name, id, account_number)
        `)
        .order('order_date', { ascending: false });

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
          display_amount: s.total_amount,
          display_date: s.order_date,
          display_type: 'SALES_ORDER',
          display_description: `Stock Sold - ${s.client_name} - Order #${s.order_number}${s.description ? ': ' + s.description : ''}`,
          display_reference: s.order_number,
          display_account: s.sales_payment_methods?.bank_accounts?.account_name ? 
            s.sales_payment_methods.bank_accounts.account_name + ' - ' + s.sales_payment_methods.bank_accounts.bank_name : 
            s.sales_payment_methods?.type || 'Not Specified',
          bank_account_id: s.sales_payment_methods?.bank_accounts?.id
        })),
        ...(purchaseData || []).map(p => ({
          ...p,
          source: 'PURCHASE',
          display_amount: p.total_amount,
          display_date: p.order_date,
          display_type: 'PURCHASE_ORDER',
          display_description: `Stock Purchase - ${p.supplier_name} - Order #${p.order_number}${p.description ? ': ' + p.description : ''}`,
          display_reference: p.order_number,
          display_account: p.bank_accounts?.account_name && p.bank_accounts?.bank_name ? 
            `${p.bank_accounts.account_name} - ${p.bank_accounts.bank_name}` : 
            'Bank Account Not Specified',
          bank_account_id: p.bank_accounts?.id
        }))
      ];

      // Sort by date
      return combinedTransactions.sort((a, b) => 
        new Date(b.display_date).getTime() - new Date(a.display_date).getTime()
      );
    },
  });

  // Filter transactions based on selected filters
  const filteredTransactions = allTransactions?.filter(transaction => {
    // Bank account filter
    if (selectedBankAccount && selectedBankAccount !== "all" && transaction.bank_account_id !== selectedBankAccount) {
      return false;
    }

    // Transaction type filter
    if (selectedTransactionType && selectedTransactionType !== "all") {
      const typeMapping: { [key: string]: string[] } = {
        'sales': ['SALES_ORDER'],
        'settlement': ['INCOME'],
        'expense': ['EXPENSE'],
        'income': ['INCOME'],
        'transfer': ['TRANSFER_IN', 'TRANSFER_OUT'],
        'purchase': ['PURCHASE_ORDER']
      };
      
      const allowedTypes = typeMapping[selectedTransactionType] || [selectedTransactionType];
      if (!allowedTypes.includes(transaction.display_type)) {
        return false;
      }
    }

    // Date range filter
    const transactionDate = new Date(transaction.display_date);
    if (dateFrom && transactionDate < dateFrom) {
      return false;
    }
    if (dateTo && transactionDate > dateTo) {
      return false;
    }

    return true;
  }) || [];

  const clearFilters = () => {
    setSelectedBankAccount("all");
    setSelectedTransactionType("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = (selectedBankAccount !== "all") || (selectedTransactionType !== "all") || dateFrom || dateTo;

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

  const downloadCSV = () => {
    const dataToDownload = filteredTransactions;
    if (!dataToDownload || dataToDownload.length === 0) return;

    const csvHeaders = [
      'Source',
      'Type',
      'Date',
      'Amount',
      'Description',
      'Reference',
      'Bank Account',
      'Created At'
    ];

    const csvData = dataToDownload.map(transaction => [
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

  const generatePDF = async () => {
    const dataToDownload = filteredTransactions;
    if (!dataToDownload || dataToDownload.length === 0) return;

    try {
      // Dynamic import to avoid SSR issues
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction Report', 20, 20);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy, HH:mm a')}`, 20, 30);
      
      // Duration
      let durationText = 'Duration: ';
      if (dateFrom && dateTo) {
        durationText += `${format(dateFrom, 'dd MMM yyyy')} - ${format(dateTo, 'dd MMM yyyy')}`;
      } else if (dateFrom) {
        durationText += `From ${format(dateFrom, 'dd MMM yyyy')}`;
      } else if (dateTo) {
        durationText += `Until ${format(dateTo, 'dd MMM yyyy')}`;
      } else {
        durationText += 'All time';
      }
      doc.text(durationText, 20, 40);

      // Summary boxes
      const totalExpenses = dataToDownload
        .filter(t => ['EXPENSE', 'PURCHASE_ORDER'].includes(t.display_type))
        .reduce((sum, t) => sum + Number(t.display_amount), 0);
      
      const totalCredit = dataToDownload
        .filter(t => ['INCOME', 'SALES_ORDER'].includes(t.display_type))
        .reduce((sum, t) => sum + Number(t.display_amount), 0);

      doc.setFontSize(10);
      doc.rect(20, 50, 80, 20);
      doc.text('Total Expenses', 25, 58);
      doc.setFont('helvetica', 'bold');
      doc.text(`₹${totalExpenses.toLocaleString('en-IN')}`, 25, 65);
      
      doc.setFont('helvetica', 'normal');
      doc.rect(110, 50, 80, 20);
      doc.text('Total Credit', 115, 58);
      doc.setFont('helvetica', 'bold');
      doc.text(`₹${totalCredit.toLocaleString('en-IN')}`, 115, 65);

      // Get bank account numbers for each transaction
      const getBankAccountNumber = (transaction: any) => {
        // First try to get from the main bank_accounts relation
        if (transaction.bank_accounts?.account_number) {
          return transaction.bank_accounts.account_number;
        }
        // For sales orders, try the nested relation
        if (transaction.sales_payment_methods?.bank_accounts?.account_number) {
          return transaction.sales_payment_methods.bank_accounts.account_number;
        }
        return 'Not Available';
      };

      // Table data
      const tableData = dataToDownload.map(transaction => [
        format(new Date(transaction.display_date), 'dd MMM yyyy'),
        transaction.display_reference || '-',
        transaction.source,
        transaction.display_account.length > 35 ? 
          transaction.display_account.substring(0, 35) + '...' : 
          transaction.display_account,
        transaction.display_type.replace('_', ' '),
        getBankAccountNumber(transaction),
        ['EXPENSE', 'PURCHASE_ORDER'].includes(transaction.display_type) ? 
          `₹${Number(transaction.display_amount).toLocaleString('en-IN')}` : '-',
        ['INCOME', 'SALES_ORDER'].includes(transaction.display_type) ? 
          `₹${Number(transaction.display_amount).toLocaleString('en-IN')}` : '-'
      ]);

      // Add table using autoTable
      autoTable(doc, {
        head: [['Date', 'Remark', 'Type', 'Bank Account', 'Category', 'Bank Account Number', 'Debit', 'Credit']],
        body: tableData,
        startY: 80,
        margin: { left: 5, right: 5 }, // Equal margins on both sides
        styles: {
          fontSize: 7, // Reduced from 8 to 7
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: [255, 255, 255],
          fontSize: 8, // Reduced from 9 to 8
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        columnStyles: {
          0: { cellWidth: 18 }, // Date
          1: { cellWidth: 22 }, // Remark
          2: { cellWidth: 16 }, // Type
          3: { cellWidth: 42 }, // Bank Account
          4: { cellWidth: 24 }, // Category
          5: { cellWidth: 30 }, // Bank Account Number - reduced by 2
          6: { cellWidth: 28, textColor: [220, 53, 69] }, // Debit (red) - reduced by 2
          7: { cellWidth: 34, textColor: [40, 167, 69] }  // Credit (green) - reduced by 2
        }
      });

      // Footer info
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total number of transactions: ${dataToDownload.length}`, 20, finalY + 10);
      
      // Add company footer
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.text('For Blynk Virtual Technologies Private Limited', 20, finalY + 25);

      // Save the PDF
      doc.save(`transaction_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
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
    <div className="space-y-6 px-4">
      {/* Filter Controls */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-blue-600" />
              Transaction Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? 'Hide' : 'Show'} Filters
              </Button>
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Bank Account Filter */}
              <div className="space-y-2">
                <Label htmlFor="bank-filter">Bank Account</Label>
                <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">All accounts</SelectItem>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.account_name} - {account.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transaction Type Filter */}
              <div className="space-y-2">
                <Label htmlFor="type-filter">Transaction Type</Label>
                <Select value={selectedTransactionType} onValueChange={setSelectedTransactionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="settlement">Settlement</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From Filter */}
              <div className="space-y-2">
                <Label>From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date To Filter */}
              <div className="space-y-2">
                <Label>To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Transactions List */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              All Transactions Directory
              <Badge variant="secondary">{filteredTransactions?.length || 0} entries</Badge>
              {hasActiveFilters && (
                <Badge variant="outline" className="text-blue-600">
                  Filtered
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={downloadCSV} 
                className="flex items-center gap-2"
                disabled={!filteredTransactions || filteredTransactions.length === 0}
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              <Button 
                onClick={generatePDF} 
                className="flex items-center gap-2"
                disabled={!filteredTransactions || filteredTransactions.length === 0}
              >
                <FileText className="h-4 w-4" />
                Generate PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!filteredTransactions || filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {hasActiveFilters ? "No transactions match the selected filters" : "No transactions found"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((transaction) => (
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
                      {transaction.source === 'PURCHASE' && (
                        <div className="text-xs text-blue-600 font-medium">
                          Payment from: {transaction.display_account}
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
