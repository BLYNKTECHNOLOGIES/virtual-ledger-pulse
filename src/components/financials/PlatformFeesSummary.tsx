import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Percent, TrendingUp, DollarSign, Wallet, ArrowRightLeft, Coins, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { format } from "date-fns";
import { useUSDTRate } from "@/hooks/useUSDTRate";
import { openTransaction } from "@/components/transaction-detail";
import { formatCompactINR, formatCompactUSDT } from "@/lib/formatCompactCurrency";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Panel,
  KpiTile,
  ShareBar,
  StatusChip,
  LegendKey,
  TablePager,
  usePaged,
  ChartTooltipBox,
  axisProps,
  gridProps,
  useChartPalette,
} from "@/components/finance-ui";

interface PlatformFeesSummaryProps {
  startDate: Date;
  endDate: Date;
}

export function PlatformFeesSummary({ startDate, endDate }: PlatformFeesSummaryProps) {
  const { data: usdtRateData } = useUSDTRate();
  const fallbackRate = usdtRateData?.rate || 0;
  const palette = useChartPalette();

  // Helper: get the best INR value for a fee deduction record
  const getFeeINR = (d: any): number => {
    // 1. Use pre-calculated INR value if available
    if (d.fee_inr_value_at_buying_price && Number(d.fee_inr_value_at_buying_price) > 0) {
      return Number(d.fee_inr_value_at_buying_price);
    }
    const usdt = Number(d.fee_usdt_amount || 0);
    // 2. Use stored market rate snapshot (locked at entry time — immutable)
    const snapshotRate = Number(d.market_rate_usdt_snapshot || 0);
    if (usdt > 0 && snapshotRate > 0) {
      return usdt * snapshotRate;
    }
    // 3. Calculate from USDT * average buying price if available
    const avgBuy = Number(d.average_buying_price || 0);
    if (usdt > 0 && avgBuy > 0) {
      return usdt * avgBuy;
    }
    // 4. Calculate from USDT * usdt_rate_used if available
    const rateUsed = Number(d.usdt_rate_used || 0);
    if (usdt > 0 && rateUsed > 0) {
      return usdt * rateUsed;
    }
    // 5. Fallback: USDT * current live rate
    if (usdt > 0) {
      return usdt * fallbackRate;
    }
    return 0;
  };

  // Fetch fee deductions data with new USDT columns
  const { data: feeData, isLoading } = useQuery({
    queryKey: ['wallet_fee_deductions', startDate, endDate],
    queryFn: async () => {
      const deductions = await fetchAllPaginated<any>(() =>
        supabase
          .from('wallet_fee_deductions')
          .select(`
            *,
            wallets:wallet_id (
              wallet_name
            )
          `)
          .gte('created_at', format(startDate, 'yyyy-MM-dd'))
          .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
          .order('created_at', { ascending: false }));

      return deductions || [];

    },
  });

  // Fetch transfer fees from wallet_transactions
  const { data: transferFeeData } = useQuery({
    queryKey: ['transfer_fees', startDate, endDate],
    queryFn: async () => {
      const transferFees = await fetchAllPaginated<any>(() => supabase
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
        .order('created_at', { ascending: false }));

      return transferFees || [];
    },
  });

  // Fetch conversion fees from erp_product_conversions
  const { data: conversionFeeData } = useQuery({
    queryKey: ['conversion_fees', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => supabase
        .from('erp_product_conversions' as any)
        .select(`
          id, side, asset_code, fee_amount, fee_asset, fee_percentage, quantity, gross_usd_value, status, approved_at, created_at, reference_no,
          wallets:wallet_id (wallet_name)
        `)
        .eq('status', 'APPROVED')
        .gt('fee_amount', 0)
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .lte('created_at', format(endDate, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false }));

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

  // Calculate summary statistics - using getFeeINR for proper INR conversion
  const totalFeesINR = feeData?.reduce((sum, d) => sum + getFeeINR(d), 0) || 0;
  const totalFeesUSDT = feeData?.reduce((sum, d) => sum + Number(d.fee_usdt_amount || 0), 0) || 0;

  // Transfer fees (already in USDT)
  const transferFeesUSDT = transferFeeData?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

  // Combined totals (include conversion fees)
  const combinedTotalUSDT = totalFeesUSDT + transferFeesUSDT + conversionFeesUSDT;

  const salesFeesINR = feeData?.filter(d => d.order_type === 'SALES').reduce((sum, d) => sum + getFeeINR(d), 0) || 0;
  const salesFeesUSDT = feeData?.filter(d => d.order_type === 'SALES').reduce((sum, d) => sum + Number(d.fee_usdt_amount || 0), 0) || 0;

  const purchaseFeesINR = feeData?.filter(d => d.order_type === 'PURCHASE').reduce((sum, d) => sum + getFeeINR(d), 0) || 0;
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
    acc[walletName].feesINR += getFeeINR(d);
    acc[walletName].feesUSDT += Number(d.fee_usdt_amount || 0);
    acc[walletName].count += 1;
    return acc;
  }, {} as Record<string, { feesINR: number; feesUSDT: number; count: number }>);

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount.toFixed(2)).toLocaleString('en-IN')}`;
  };

  const formatUSDT = (amount: number) => {
    return `${amount.toFixed(4)} USDT`;
  };

  // Display-only: fees per day by source (USDT), for the trend chart.
  const daily = useMemo(() => {
    const map = new Map<string, { day: string; label: string; sales: number; purchase: number; transfer: number }>();
    const add = (iso: string, key: 'sales' | 'purchase' | 'transfer', v: number) => {
      if (!iso) return;
      const d = new Date(iso);
      const k = format(d, 'yyyy-MM-dd');
      if (!map.has(k)) map.set(k, { day: k, label: format(d, 'dd MMM'), sales: 0, purchase: 0, transfer: 0 });
      map.get(k)![key] += v;
    };
    (feeData || []).forEach((d: any) => add(d.created_at, d.order_type === 'PURCHASE' ? 'purchase' : 'sales', Number(d.fee_usdt_amount || 0)));
    (transferFeeData || []).forEach((t: any) => add(t.created_at, 'transfer', Number(t.amount || 0)));
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [feeData, transferFeeData]);

  // Fee rows with no stored INR value or rate fall back to the live USDT rate (step 5 above).
  const liveRateRows = (feeData || []).filter((d: any) => {
    if (d.fee_inr_value_at_buying_price && Number(d.fee_inr_value_at_buying_price) > 0) return false;
    if (!(Number(d.fee_usdt_amount || 0) > 0)) return false;
    return !(Number(d.market_rate_usdt_snapshot || 0) > 0) && !(Number(d.average_buying_price || 0) > 0) && !(Number(d.usdt_rate_used || 0) > 0);
  }).length;
  const rateIsFallback = !!usdtRateData?.isFallback;

  const walletRows = useMemo(
    () => Object.entries(feesByWallet || {}).map(([wallet, v]) => ({ wallet, ...(v as { feesINR: number; feesUSDT: number; count: number }) })).sort((a, b) => b.feesINR - a.feesINR),
    [feesByWallet]
  );
  const walletMax = walletRows.reduce((m, w) => Math.max(m, w.feesINR), 0);

  const deductionPager = usePaged(feeData || [], 15, `${startDate}-${endDate}`);
  const transferPager = usePaged(transferFeeData || [], 10, `${startDate}-${endDate}`);
  const conversionPager = usePaged(conversionFeeData || [], 10, `${startDate}-${endDate}`);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
        <ChartSkeleton height={220} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile
          label="Total Platform Fees"
          value={formatCompactINR(totalFeesINR)}
          exact={formatCurrency(totalFeesINR)}
          sub={<span className="tabular-nums">{formatUSDT(combinedTotalUSDT)} incl. transfers & conversions</span>}
          icon={Coins}
          info="Platform fees are deducted in USDT from wallet balances. The INR value shown is calculated using the average buying price of USDT in the period, ensuring accurate cost accounting. Transfer fees from wallet-to-wallet transfers are tracked separately in USDT."
        />
        <KpiTile
          label="Fees from Sales"
          value={formatCompactINR(salesFeesINR)}
          exact={formatCurrency(salesFeesINR)}
          sub={<span className="tabular-nums">{formatUSDT(salesFeesUSDT)}</span>}
          icon={TrendingUp}
        />
        <KpiTile
          label="Fees from Purchases"
          value={formatCompactINR(purchaseFeesINR)}
          exact={formatCurrency(purchaseFeesINR)}
          sub={<span className="tabular-nums">{formatUSDT(purchaseFeesUSDT)}</span>}
          icon={DollarSign}
        />
        <KpiTile
          label="Conversion Fees"
          value={formatCompactUSDT(conversionFeesUSDT)}
          exact={formatUSDT(conversionFeesUSDT)}
          sub={`${conversionFeeData?.length || 0} conversions`}
          icon={ArrowRightLeft}
        />
        <KpiTile
          label="Transfer Fees"
          value={formatCompactUSDT(transferFeesUSDT)}
          exact={formatUSDT(transferFeesUSDT)}
          sub={`${transferFeeData?.length || 0} transfers`}
          icon={ArrowRightLeft}
        />
        <KpiTile
          label="Average Fee Rate"
          value={`${avgFeeRate}%`}
          sub="On sales/purchase orders"
          icon={Percent}
        />
      </div>

      {liveRateRows > 0 && (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${rateIsFallback || !fallbackRate ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-muted/40 text-muted-foreground'}`}>
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {liveRateRows} fee {liveRateRows === 1 ? 'value has' : 'values have'} no stored rate and {liveRateRows === 1 ? 'is' : 'are'} converted at{' '}
            {!fallbackRate
              ? 'no rate — the USDT rate is unavailable, so they count as ₹0.'
              : rateIsFallback
                ? `the last saved USDT rate (₹${fallbackRate.toFixed(2)}) because the live rate is unavailable.`
                : `the live USDT rate (₹${fallbackRate.toFixed(2)}, ${usdtRateData?.source || 'live'}).`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" icon={BarChart3} title="Fees per day" description="USDT deducted, by source">
          {daily.length === 0 ? (
            <EmptyState icon={Coins} title="No fees in this period" className="py-10" />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1">
                <LegendKey color={palette.s1} label="Sales orders" value={formatUSDT(salesFeesUSDT)} />
                <LegendKey color={palette.s2} label="Purchase orders" value={formatUSDT(purchaseFeesUSDT)} />
                <LegendKey color={palette.s3} label="Transfers" value={formatUSDT(transferFeesUSDT)} />
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                    <YAxis {...axisProps} width={44} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox
                          title={label}
                          rows={[
                            { key: 's', label: 'Sales orders', value: formatUSDT(Number(payload.find((p: any) => p.dataKey === 'sales')?.value || 0)), color: palette.s1 },
                            { key: 'p', label: 'Purchase orders', value: formatUSDT(Number(payload.find((p: any) => p.dataKey === 'purchase')?.value || 0)), color: palette.s2 },
                            { key: 't', label: 'Transfers', value: formatUSDT(Number(payload.find((p: any) => p.dataKey === 'transfer')?.value || 0)), color: palette.s3 },
                          ]}
                        />
                      ) : null}
                    />
                    <Bar dataKey="sales" stackId="f" fill={palette.s1} maxBarSize={24} />
                    <Bar dataKey="purchase" stackId="f" fill={palette.s2} maxBarSize={24} />
                    <Bar dataKey="transfer" stackId="f" fill={palette.s3} maxBarSize={24} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Panel>

        <Panel className="xl:col-span-4" icon={Wallet} title="Fees by Wallet/Platform" description="Order fees deducted per wallet">
          {walletRows.length === 0 ? (
            <EmptyState icon={Wallet} title="No wallet fees" className="py-10" />
          ) : (
            <div className="space-y-3">
              {walletRows.map((w) => (
                <div key={w.wallet}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{w.wallet}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(w.feesINR)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ShareBar value={w.feesINR} max={walletMax} />
                    <span className="w-36 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{formatUSDT(w.feesUSDT)} · {w.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Recent Fee Deductions Table */}
      <Panel icon={Percent} title="Recent Fee Deductions" description="Newest first">
        {feeData && feeData.length > 0 ? (
          <>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Order Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Wallet</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Order Amount</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Fee %</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Fee (USDT)</TableHead>
                  <TableHead className="text-right">Fee Value (INR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductionPager.slice.map((deduction: any) => (
                  <TableRow key={deduction.id}>
                    <TableCell className="whitespace-nowrap text-sm">{format(new Date(deduction.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="t-mono hidden text-xs sm:table-cell">{deduction.order_number}</TableCell>
                    <TableCell>
                      <StatusChip tone={deduction.order_type === 'SALES' ? 'info' : 'neutral'}>{deduction.order_type}</StatusChip>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{deduction.wallets?.wallet_name || 'N/A'}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right font-mono text-[13px] tabular-nums md:table-cell">{formatCurrency(Number(deduction.gross_amount))}</TableCell>
                    <TableCell className="hidden text-right font-mono text-[13px] tabular-nums lg:table-cell">{Number(deduction.fee_percentage).toFixed(2)}%</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right font-medium font-mono text-[13px] tabular-nums sm:table-cell">
                      {formatUSDT(Number(deduction.fee_usdt_amount || 0))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium font-mono text-[13px] tabular-nums">
                      {formatCurrency(getFeeINR(deduction))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePager {...deductionPager} noun="fee deductions" />
          </>
        ) : (
          <EmptyState icon={Coins} title="No fee deductions found" description="Fee deductions will appear here when orders with platform fees are created" />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {/* Transfer Fees Section */}
        {transferFeeData && transferFeeData.length > 0 && (
          <Panel icon={ArrowRightLeft} title="Recent Transfer Fees">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>From Wallet</TableHead>
                  <TableHead className="hidden lg:table-cell">Description</TableHead>
                  <TableHead className="text-right">Fee (USDT)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferPager.slice.map((fee: any) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="whitespace-nowrap text-sm">{format(new Date(fee.created_at), 'dd/MM/yyyy')}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(fee.created_at), 'HH:mm:ss')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{fee.wallets?.wallet_name || 'N/A'}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {fee.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium font-mono text-[13px] tabular-nums">
                      {formatUSDT(Number(fee.amount || 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePager {...transferPager} noun="transfer fees" />
          </Panel>
        )}

        {/* Conversion Fees Section */}
        {conversionFeeData && conversionFeeData.length > 0 && (
          <Panel icon={Coins} title="Conversion Fees (Spot Trade)" description="Click a row for the full conversion">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="hidden lg:table-cell">Wallet</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Quantity</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Fee</TableHead>
                  <TableHead className="text-right">Fee (USDT eq.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionPager.slice.map((c: any) => {
                  const priceUsd = c.quantity > 0 ? c.gross_usd_value / c.quantity : 0;
                  const feeUsdtEq = c.fee_asset === 'USDT' ? Number(c.fee_amount) : Number(c.fee_amount) * priceUsd;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openTransaction({ type: 'product_conversion', id: c.id })} title="Click to view full conversion details">
                      <TableCell className="whitespace-nowrap text-sm">{format(new Date(c.created_at), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="t-mono hidden text-xs md:table-cell">{c.reference_no || '-'}</TableCell>
                      <TableCell>
                        <StatusChip tone={c.side === 'BUY' ? 'neutral' : 'info'}>{c.side}</StatusChip>
                      </TableCell>
                      <TableCell className="text-sm">{c.asset_code}</TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{c.wallets?.wallet_name || 'N/A'}</TableCell>
                      <TableCell className="hidden text-right font-mono text-[13px] tabular-nums xl:table-cell">{Number(c.quantity).toFixed(6)}</TableCell>
                      <TableCell className="hidden whitespace-nowrap text-right font-mono text-[13px] tabular-nums sm:table-cell">{Number(c.fee_amount).toFixed(6)} {c.fee_asset}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium font-mono text-[13px] tabular-nums">{feeUsdtEq.toFixed(4)} USDT</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePager {...conversionPager} noun="conversions" />
          </Panel>
        )}
      </div>
    </div>
  );
}
