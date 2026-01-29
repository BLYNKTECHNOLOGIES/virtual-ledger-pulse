import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Percent, TrendingUp, DollarSign, Wallet, ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface PlatformFeesSummaryProps {
  startDate: Date;
  endDate: Date;
}

export function PlatformFeesSummary({ startDate, endDate }: PlatformFeesSummaryProps) {
  // Fetch fee deductions data
  const { data: feeData, isLoading } = useQuery({
    queryKey: ['wallet_fee_deductions', startDate, endDate],
    queryFn: async () => {
      const { data: deductions, error } = await supabase
        .from('wallet_fee_deductions')
        .select(`
          *,
          wallets:wallet_id (
            wallet_name,
            wallet_type
          )
        `)
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return deductions || [];
    },
  });

  // Calculate summary statistics
  const totalFees = feeData?.reduce((sum, d) => sum + Number(d.fee_amount || 0), 0) || 0;
  const salesFees = feeData?.filter(d => d.order_type === 'SALES').reduce((sum, d) => sum + Number(d.fee_amount || 0), 0) || 0;
  const purchaseFees = feeData?.filter(d => d.order_type === 'PURCHASE').reduce((sum, d) => sum + Number(d.fee_amount || 0), 0) || 0;
  
  // Calculate average fee rate
  const totalGross = feeData?.reduce((sum, d) => sum + Number(d.gross_amount || 0), 0) || 0;
  const avgFeeRate = totalGross > 0 ? ((totalFees / totalGross) * 100).toFixed(2) : '0.00';

  // Group by wallet
  const feesByWallet = feeData?.reduce((acc, d) => {
    const walletName = d.wallets?.wallet_name || 'Unknown';
    if (!acc[walletName]) {
      acc[walletName] = { fees: 0, count: 0 };
    }
    acc[walletName].fees += Number(d.fee_amount || 0);
    acc[walletName].count += 1;
    return acc;
  }, {} as Record<string, { fees: number; count: number }>);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2).toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading fee data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm font-medium">Total Platform Fees</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(totalFees)}</p>
                <p className="text-sm text-amber-200 mt-1">This Period</p>
              </div>
              <div className="bg-amber-600 p-3 rounded-xl">
                <Percent className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Fees from Sales</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(salesFees)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpIcon className="h-3 w-3" />
                  <span className="text-sm text-emerald-200">{feeData?.filter(d => d.order_type === 'SALES').length || 0} orders</span>
                </div>
              </div>
              <div className="bg-emerald-600 p-3 rounded-xl">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Fees from Purchases</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(purchaseFees)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowDownIcon className="h-3 w-3" />
                  <span className="text-sm text-blue-200">{feeData?.filter(d => d.order_type === 'PURCHASE').length || 0} orders</span>
                </div>
              </div>
              <div className="bg-blue-600 p-3 rounded-xl">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-violet-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Average Fee Rate</p>
                <p className="text-2xl font-bold mt-2">{avgFeeRate}%</p>
                <p className="text-sm text-purple-200 mt-1">Across all orders</p>
              </div>
              <div className="bg-purple-600 p-3 rounded-xl">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fees by Wallet */}
      {feesByWallet && Object.keys(feesByWallet).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Fees by Wallet/Platform
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(feesByWallet).map(([wallet, data]) => (
                <div key={wallet} className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">{wallet}</p>
                    <p className="text-sm text-muted-foreground">{data.count} transactions</p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {formatCurrency(data.fees)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Fee Deductions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Recent Fee Deductions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feeData && feeData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Gross Amount</TableHead>
                  <TableHead className="text-right">Fee %</TableHead>
                  <TableHead className="text-right">Fee Amount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeData.slice(0, 20).map((deduction) => (
                  <TableRow key={deduction.id}>
                    <TableCell>{format(new Date(deduction.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm">{deduction.order_number}</TableCell>
                    <TableCell>
                      <Badge variant={deduction.order_type === 'SALES' ? 'default' : 'secondary'}>
                        {deduction.order_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{deduction.wallets?.wallet_name || 'N/A'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(deduction.gross_amount))}</TableCell>
                    <TableCell className="text-right">{Number(deduction.fee_percentage).toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">
                      {formatCurrency(Number(deduction.fee_amount))}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(deduction.net_amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No fee deductions found</p>
              <p className="text-sm">Fee deductions will appear here when orders with platform fees are created</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
