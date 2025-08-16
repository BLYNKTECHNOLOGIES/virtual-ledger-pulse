import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Calendar, Building, DollarSign, FileText, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Settlement {
  id: string;
  settlement_batch_id: string;
  bank_account_id: string;
  total_amount: number;
  mdr_amount: number;
  net_amount: number;
  mdr_rate: number;
  settlement_date: string;
  status: string;
  created_at: string;
  bank_accounts: {
    account_name: string;
    bank_name: string;
    account_number: string;
  };
  settlement_items: {
    id: string;
    amount: number;
    sales_orders: {
      order_number: string;
      client_name: string;
    };
  }[];
}

interface SettlementStats {
  totalSettled: number;
  totalTransactions: number;
  totalMdrDeducted: number;
  averageSettlementAmount: number;
}

export function SettlementSummary() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [filteredSettlements, setFilteredSettlements] = useState<Settlement[]>([]);
  const [stats, setStats] = useState<SettlementStats>({
    totalSettled: 0,
    totalTransactions: 0,
    totalMdrDeducted: 0,
    averageSettlementAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBank, setSelectedBank] = useState("");
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettlements();
    fetchBankAccounts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [settlements, dateFrom, dateTo, selectedBank]);

  const fetchBankAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('status', 'ACTIVE')
        .order('account_name');

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    }
  };

  const fetchSettlements = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_gateway_settlements')
        .select(`
          *,
          bank_accounts (
            account_name,
            bank_name,
            account_number
          ),
          payment_gateway_settlement_items (
            id,
            amount,
            sales_orders (
              order_number,
              client_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const transformedData = (data || []).map((settlement: any) => ({
        ...settlement,
        settlement_items: settlement.payment_gateway_settlement_items || []
      }));

      setSettlements(transformedData);
      calculateStats(transformedData);
    } catch (error) {
      console.error('Error fetching settlements:', error);
      toast({
        title: "Error",
        description: "Failed to fetch settlement data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...settlements];

    // Date filters
    if (dateFrom) {
      filtered = filtered.filter(s => new Date(s.settlement_date) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(s => new Date(s.settlement_date) <= new Date(dateTo));
    }

    // Bank filter
    if (selectedBank) {
      filtered = filtered.filter(s => s.bank_account_id === selectedBank);
    }

    setFilteredSettlements(filtered);
    calculateStats(filtered);
  };

  const calculateStats = (settlementData: Settlement[]) => {
    const totalSettled = settlementData.reduce((sum, s) => sum + s.net_amount, 0);
    const totalTransactions = settlementData.reduce((sum, s) => sum + s.settlement_items.length, 0);
    const totalMdrDeducted = settlementData.reduce((sum, s) => sum + s.mdr_amount, 0);
    const averageSettlementAmount = settlementData.length > 0 ? totalSettled / settlementData.length : 0;

    setStats({
      totalSettled,
      totalTransactions,
      totalMdrDeducted,
      averageSettlementAmount
    });
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedBank("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Settlement Summary</h3>
        <Button variant="outline" onClick={clearFilters} className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Clear Filters
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Settled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-green-600">
                ₹{stats.totalSettled.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-600">
                {stats.totalTransactions}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total MDR Deducted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-red-600" />
              <span className="text-2xl font-bold text-red-600">
                ₹{stats.totalMdrDeducted.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Average Settlement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              <span className="text-2xl font-bold text-purple-600">
                ₹{stats.averageSettlementAmount.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bankAccount">Bank Account</Label>
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger>
                  <SelectValue placeholder="All banks" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="">All banks</SelectItem>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settlements Table */}
      <Card>
        <CardHeader>
          <CardTitle>Settlement History</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSettlements.length === 0 ? (
            <div className="text-center py-8">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No settlements found</p>
              <p className="text-sm text-gray-400 mt-2">
                Try adjusting your filters or date range
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead>Gross Amount</TableHead>
                  <TableHead>MDR Charges</TableHead>
                  <TableHead>Net Amount</TableHead>
                  <TableHead>Settlement Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSettlements.map((settlement) => (
                  <TableRow key={settlement.id}>
                    <TableCell className="font-medium">
                      {settlement.settlement_batch_id}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{settlement.bank_accounts.account_name}</p>
                        <p className="text-sm text-gray-500">{settlement.bank_accounts.bank_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>{settlement.settlement_items.length}</TableCell>
                    <TableCell>₹{settlement.total_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-red-600">
                      ₹{settlement.mdr_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      ₹{settlement.net_amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {format(new Date(settlement.settlement_date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {settlement.status || 'COMPLETED'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}