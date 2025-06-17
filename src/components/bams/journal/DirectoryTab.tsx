
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, Search, Filter, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TransactionRecord {
  id: string;
  date: Date;
  type: "Credit" | "Debit";
  ledger: "Income" | "Expense" | "Sales" | "Purchase" | "Transfer";
  bankAccount: string;
  amount: number;
  description: string;
  reference: string;
}

export function DirectoryTab() {
  const [transactions] = useState<TransactionRecord[]>([
    {
      id: "1",
      date: new Date("2024-01-15"),
      type: "Credit",
      ledger: "Income",
      bankAccount: "HDFC Current Account",
      amount: 50000,
      description: "Client payment received",
      reference: "TXN001"
    },
    {
      id: "2",
      date: new Date("2024-01-16"),
      type: "Debit",
      ledger: "Expense",
      bankAccount: "HDFC Current Account",
      amount: 15000,
      description: "Office rent payment",
      reference: "TXN002"
    },
    {
      id: "3",
      date: new Date("2024-01-17"),
      type: "Credit",
      ledger: "Sales",
      bankAccount: "ICICI Savings Account",
      amount: 75000,
      description: "Product sale",
      reference: "TXN003"
    }
  ]);

  const [filters, setFilters] = useState({
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
    amountMin: "",
    amountMax: "",
    bankAccount: "",
    ledgerType: "",
    searchTerm: ""
  });

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = !filters.searchTerm || 
      transaction.description.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      transaction.reference.toLowerCase().includes(filters.searchTerm.toLowerCase());
    
    const matchesDateFrom = !filters.dateFrom || transaction.date >= filters.dateFrom;
    const matchesDateTo = !filters.dateTo || transaction.date <= filters.dateTo;
    
    const matchesAmountMin = !filters.amountMin || transaction.amount >= parseFloat(filters.amountMin);
    const matchesAmountMax = !filters.amountMax || transaction.amount <= parseFloat(filters.amountMax);
    
    const matchesBankAccount = !filters.bankAccount || transaction.bankAccount === filters.bankAccount;
    const matchesLedger = !filters.ledgerType || transaction.ledger === filters.ledgerType;

    return matchesSearch && matchesDateFrom && matchesDateTo && 
           matchesAmountMin && matchesAmountMax && matchesBankAccount && matchesLedger;
  });

  const downloadCSV = () => {
    const headers = ["Date", "Type", "Ledger", "Bank Account", "Amount", "Description", "Reference"];
    const csvData = filteredTransactions.map(t => [
      format(t.date, "yyyy-MM-dd"),
      t.type,
      t.ledger,
      t.bankAccount,
      t.amount,
      t.description,
      t.reference
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="search">Search Transactions</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by description or reference..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>Date From</Label>
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
                    {filters.dateFrom ? format(filters.dateFrom, "MMM dd") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.dateFrom}
                    onSelect={(date) => setFilters({...filters, dateFrom: date})}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Date To</Label>
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
                    {filters.dateTo ? format(filters.dateTo, "MMM dd") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.dateTo}
                    onSelect={(date) => setFilters({...filters, dateTo: date})}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="amountMin">Min Amount</Label>
              <Input
                id="amountMin"
                type="number"
                placeholder="0"
                value={filters.amountMin}
                onChange={(e) => setFilters({...filters, amountMin: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="amountMax">Max Amount</Label>
              <Input
                id="amountMax"
                type="number"
                placeholder="No limit"
                value={filters.amountMax}
                onChange={(e) => setFilters({...filters, amountMax: e.target.value})}
              />
            </div>

            <div>
              <Label>Bank Account</Label>
              <Select value={filters.bankAccount} onValueChange={(value) => setFilters({...filters, bankAccount: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All accounts</SelectItem>
                  <SelectItem value="HDFC Current Account">HDFC Current Account</SelectItem>
                  <SelectItem value="ICICI Savings Account">ICICI Savings Account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ledger Type</Label>
              <Select value={filters.ledgerType} onValueChange={(value) => setFilters({...filters, ledgerType: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  <SelectItem value="Income">Income</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Purchase">Purchase</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transaction Directory</CardTitle>
          <Button onClick={downloadCSV} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ledger</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No transactions found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">
                        {format(transaction.date, "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className={cn(
                          "flex items-center gap-2 font-medium",
                          transaction.type === "Credit" ? "text-green-600" : "text-red-600"
                        )}>
                          {transaction.type === "Credit" ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {transaction.type}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium">
                          {transaction.ledger}
                        </span>
                      </TableCell>
                      <TableCell>{transaction.bankAccount}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "font-semibold",
                          transaction.type === "Credit" ? "text-green-600" : "text-red-600"
                        )}>
                          {transaction.type === "Credit" ? "+" : "-"}₹{transaction.amount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {transaction.reference}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
