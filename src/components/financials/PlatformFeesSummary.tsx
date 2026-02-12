import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Percent, TrendingUp, DollarSign, Wallet, ArrowUpIcon, ArrowDownIcon, Coins, ArrowRightLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface PlatformFeesSummaryProps {
  startDate: Date;
  endDate: Date;
}

export function PlatformFeesSummary({ startDate, endDate }: PlatformFeesSummaryProps) {
  // Fetch fee deductions data with new USDT columns
  const { data: feeData, isLoading } = useQuery({
    queryKey: ['wallet_fee_deductions', startDate, endDate],
    queryFn: async () => {
      const { data: deductions, error } = await supabase
        .from('wallet_fee_deductions')
        .select(`
          *,
          wallets:wallet_id (
            wallet_name
          )
        `)
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return deductions || [];
    },
  });

  // Fetch transfer fees from wallet_transactions
  const { data: transferFeeData } = useQuery({
    queryKey: ['transfer_fees', startDate, endDate],
    queryFn: async () => {
      const { data: transferFees, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets:wallet_id (
            wallet_name
          )
        `)
        .eq('reference_type', 'TRANSFER_FEE')
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return transferFees || [];
    },
  });

  // Fetch conversion fees from erp_product_conversions
  const { data: conversionFeeData } = useQuery({
    queryKey: ['conversion_fees', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_product_conversions' as any)
        .select(`
          id, side, asset_code, fee_amount, fee_asset, fee_percentage, quantity, gross_usd_value, status, approved_at, created_at, reference_no,
          wallets:wallet_id (wallet_name)
        `)
        .eq('status', 'APPROVED')
        .gt('fee_amount', 0)
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Conversion fee totals (fees are in asset for BUY, USDT for SELL)
  const conversionFeesUSDT = conversionFeeData?.reduce((sum, c) => {
    // For SELL side, fee is in USDT directly
    if (c.fee_asset === 'USDT') return sum + Number(c.fee_amount || 0);
    // For BUY side, fee is in the asset - approximate USDT value using price
    const priceUsd = c.gross_usd_value / c.quantity;
    return sum + (Number(c.fee_amount || 0) * priceUsd);
  }, 0) || 0;

  // Calculate summary statistics - now using fee_inr_value_at_buying_price for accounting
  const totalFeesINR = feeData?.reduce((sum, d) => sum + Number(d.fee_inr_value_at_buying_price || d.fee_amount || 0), 0) || 0;
  const totalFeesUSDT = feeData?.reduce((sum, d) => sum + Number(d.fee_usdt_amount || 0), 0) || 0;
  
  // Transfer fees (already in USDT)
  const transferFeesUSDT = transferFeeData?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;
  
  // Combined totals (include conversion fees)
  const combinedTotalUSDT = totalFeesUSDT + transferFeesUSDT + conversionFeesUSDT;
  
  const salesFeesINR = feeData?.filter(d => d.order_type === 'SALES').reduce((sum, d) => sum + Number(d.fee_inr_value_at_buying_price || d.fee_amount || 0), 0) || 0;
  const salesFeesUSDT = feeData?.filter(d => d.order_type === 'SALES').reduce((sum, d) => sum + Number(d.fee_usdt_amount || 0), 0) || 0;
  
  const purchaseFeesINR = feeData?.filter(d => d.order_type === 'PURCHASE').reduce((sum, d) => sum + Number(d.fee_inr_value_at_buying_price || d.fee_amount || 0), 0) || 0;
  const purchaseFeesUSDT = feeData?.filter(d => d.order_type === 'PURCHASE').reduce((sum, d) => sum + Number(d.fee_usdt_amount || 0), 0) || 0;
  
  // Calculate average fee rate
  const totalGross = feeData?.reduce((sum, d) => sum + Number(d.gross_amount || 0), 0) || 0;
  const avgFeeRate = totalGross > 0 ? ((feeData?.reduce((sum, d) => sum + Number(d.fee_amount || 0), 0) || 0) / totalGross * 100).toFixed(2) : '0.00';

  // Group by wallet with USDT values
  const feesByWallet = feeData?.reduce((acc, d) => {
    const walletName = d.wallets?.wallet_name || 'Unknown';
    if (!acc[walletName]) {
      acc[walletName] = { feesINR: 0, feesUSDT: 0, count: 0 };
    }
    acc[walletName].feesINR += Number(d.fee_inr_value_at_buying_price || d.fee_amount || 0);
    acc[walletName].feesUSDT += Number(d.fee_usdt_amount || 0);
    acc[walletName].count += 1;
    return acc;
  }, {} as Record<string, { feesINR: number; feesUSDT: number; count: number }>);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2).toLocaleString()}`;
  };

  const formatUSDT = (amount: number) => {
    return `${amount.toFixed(4)} USDT`;
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm font-medium">Total Platform Fees</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(totalFeesINR)}</p>
                <p className="text-sm text-amber-200 mt-1">{formatUSDT(combinedTotalUSDT)}</p>
              </div>
              <div className="bg-amber-600 p-3 rounded-xl">
                <Coins className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium">Fees from Sales</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(salesFeesINR)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpIcon className="h-3 w-3" />
                  <span className="text-sm text-emerald-200">{formatUSDT(salesFeesUSDT)}</span>
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
                <p className="text-2xl font-bold mt-2">{formatCurrency(purchaseFeesINR)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowDownIcon className="h-3 w-3" />
                  <span className="text-sm text-blue-200">{formatUSDT(purchaseFeesUSDT)}</span>
                </div>
              </div>
              <div className="bg-blue-600 p-3 rounded-xl">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500 to-teal-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-cyan-100 text-sm font-medium">Conversion Fees</p>
                <p className="text-2xl font-bold mt-2">{formatUSDT(conversionFeesUSDT)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowRightLeft className="h-3 w-3" />
                  <span className="text-sm text-cyan-200">{conversionFeeData?.length || 0} conversions</span>
                </div>
              </div>
              <div className="bg-cyan-600 p-3 rounded-xl">
                <Coins className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-violet-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Transfer Fees</p>
                <p className="text-2xl font-bold mt-2">{formatUSDT(transferFeesUSDT)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowRightLeft className="h-3 w-3" />
                  <span className="text-sm text-purple-200">{transferFeeData?.length || 0} transfers</span>
                </div>
              </div>
              <div className="bg-purple-600 p-3 rounded-xl">
                <ArrowRightLeft className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Avg Fee Rate Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-500 to-gray-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-100 text-sm font-medium">Average Fee Rate</p>
                <p className="text-2xl font-bold mt-2">{avgFeeRate}%</p>
                <p className="text-sm text-slate-200 mt-1">On sales/purchase orders</p>
              </div>
              <div className="bg-slate-600 p-3 rounded-xl">
                <Percent className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card about calculation */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Coins className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">Fee Calculation Method</p>
              <p className="text-amber-700 mt-1">
                Platform fees are deducted in USDT from wallet balances. The INR value shown is calculated using the average buying price of USDT in the period, ensuring accurate cost accounting. Transfer fees from wallet-to-wallet transfers are tracked separately in USDT.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Fees Section */}
      {transferFeeData && transferFeeData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Recent Transfer Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>From Wallet</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Fee (USDT)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferFeeData.slice(0, 10).map((fee: any) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{format(new Date(fee.created_at), 'dd/MM/yyyy')}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(fee.created_at), 'HH:mm:ss')}</span>
                      </div>
                    </TableCell>
                    <TableCell>{fee.wallets?.wallet_name || 'N/A'}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                      {fee.description}
                    </TableCell>
                    <TableCell className="text-right text-amber-600 font-medium">
                      {formatUSDT(Number(fee.amount || 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Conversion Fees Section */}
      {conversionFeeData && conversionFeeData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Conversion Fees (Spot Trade)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Fee (USDT eq.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionFeeData.slice(0, 15).map((c: any) => {
                  const priceUsd = c.quantity > 0 ? c.gross_usd_value / c.quantity : 0;
                  const feeUsdtEq = c.fee_asset === 'USDT' ? Number(c.fee_amount) : Number(c.fee_amount) * priceUsd;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{format(new Date(c.created_at), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-mono text-sm">{c.reference_no || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={c.side === 'BUY' ? 'default' : 'secondary'}>{c.side}</Badge>
                      </TableCell>
                      <TableCell>{c.asset_code}</TableCell>
                      <TableCell>{c.wallets?.wallet_name || 'N/A'}</TableCell>
                      <TableCell className="text-right">{Number(c.quantity).toFixed(6)}</TableCell>
                      <TableCell className="text-right">{Number(c.fee_amount).toFixed(6)} {c.fee_asset}</TableCell>
                      <TableCell className="text-right text-cyan-600 font-medium">{feeUsdtEq.toFixed(4)} USDT</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
                    <p className="text-xs text-amber-600">{formatUSDT(data.feesUSDT)}</p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {formatCurrency(data.feesINR)}
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
                  <TableHead className="text-right">Order Amount</TableHead>
                  <TableHead className="text-right">Fee %</TableHead>
                  <TableHead className="text-right">Fee (USDT)</TableHead>
                  <TableHead className="text-right">Fee Value (INR)</TableHead>
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
                      {formatUSDT(Number(deduction.fee_usdt_amount || 0))}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(deduction.fee_inr_value_at_buying_price || deduction.fee_amount || 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No fee deductions found</p>
              <p className="text-sm">Fee deductions will appear here when orders with platform fees are created</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
