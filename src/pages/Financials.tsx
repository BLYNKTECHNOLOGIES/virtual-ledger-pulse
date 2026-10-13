import { COGS_CATEGORY_IN_FILTER, isOperatingExpenseRow } from "@/lib/operatingExpense";
import { Fragment, useMemo, useState } from "react";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp,
  BarChart3,
  Wallet,
  Calculator,
  FileText,
  Download,
  Plus,
  Building,
  Shield,
  Percent,
  ArrowRightLeft,
  Landmark,
  BookOpen,
  PieChart,
  Layers,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, ReferenceLine, AreaChart, Area } from "recharts";
import { PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { PlatformFeesSummary } from "@/components/financials/PlatformFeesSummary";
import { useTotalAssetValue, TotalAssetValueDialog } from "@/components/financials/TotalAssetValueWidget";
import { AssetValueHistoryTab, useAssetValueHistory, cleanAssetHistory } from "@/components/financials/AssetValueHistoryTab";
import { BalanceSheetDialog } from "@/components/financials/BalanceSheetDialog";
import { ClickableRow } from "@/components/transaction-detail";
import { cn } from "@/lib/utils";
import {
  Panel,
  KpiTile,
  StripHeading,
  ShareBar,
  StatusChip,
  LegendKey,
  UpdatingPill,
  DeltaChip,
  TablePager,
  usePaged,
  rowOpenProps,
  ChartTooltipBox,
  axisProps,
  gridProps,
  axisInr,
  useChartPalette,
  downloadWorkbook,
  formatCompactINR,
  formatExactINR,
  inr,
  shortEntityName,
  tidyLabel,
  count as fmtCount,
} from "@/components/finance-ui";

const TAB_TRIGGER =
  "ds-subnav-item rounded-none bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none flex items-center gap-1.5";

const TX_TYPE: Record<string, { label: string; sign: 1 | -1; tone: "success" | "danger" | "neutral" | "info" }> = {
  INCOME: { label: "Income", sign: 1, tone: "success" },
  EXPENSE: { label: "Expense", sign: -1, tone: "danger" },
  TRANSFER_IN: { label: "Transfer in", sign: 1, tone: "info" },
  TRANSFER_OUT: { label: "Transfer out", sign: -1, tone: "neutral" },
};

export default function Financials() {
  const navigate = useNavigate();
  const palette = useChartPalette();
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const [assetBreakdownOpen, setAssetBreakdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [datePreset, setDatePreset] = useState<DateRangePreset>(() => {
    const saved = localStorage.getItem('financials_date_preset');
    return (saved as DateRangePreset) || 'today';
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const saved = localStorage.getItem('financials_date_preset');
    return getDateRangeFromPreset((saved as DateRangePreset) || 'today');
  });

  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    localStorage.setItem('financials_date_preset', preset);
  };

  // Calculate date range based on selected range
  const getDateRangeValues = () => {
    if (dateRange?.from && dateRange?.to) {
      return { start: dateRange.from, end: dateRange.to };
    }
    // Fallback to current month
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  };

  const { start: startDate, end: endDate } = getDateRangeValues();
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');
  const periodLabel = startStr === endStr
    ? format(startDate, 'dd MMM yyyy')
    : `${format(startDate, 'dd MMM')} – ${format(endDate, 'dd MMM yyyy')}`;

  // Live position (banks + POS + stock − TDS), refreshed every minute by the shared hook.
  const { data: position, isLoading: positionLoading } = useTotalAssetValue();
  // Daily snapshots for the 30-day trend line (same query as the Asset Value History tab).
  const { data: assetHistory } = useAssetValueHistory();
  const assetTrend = useMemo(() => {
    const { cleanedHistory } = cleanAssetHistory(assetHistory as any[]);
    const last = cleanedHistory.slice(-31);
    const first = last[0] ? Number(last[0].total_asset_value) : 0;
    const latest = last.length ? Number(last[last.length - 1].total_asset_value) : 0;
    return {
      points: last.map((r: any) => ({ d: format(new Date(r.snapshot_date), 'dd MMM'), v: Number(r.total_asset_value) })),
      change: first > 0 && last.length > 1 ? ((latest - first) / first) * 100 : null,
      from: last[0]?.snapshot_date as string | undefined,
    };
  }, [assetHistory]);

  // Fetch financial data
  const { data: financialData, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['financial_data', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    // Keep the previous period on screen (dimmed) while a new one loads.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // Get revenue data from sales orders (paginated — ranges can exceed 1000 rows)
      const salesData = await fetchAllPaginated<any>(() =>
        supabase
          .from('sales_orders')
          .select('total_amount, order_date, created_at')
          .gte('order_date', format(startDate, 'yyyy-MM-dd'))
          .lte('order_date', format(endDate, 'yyyy-MM-dd'))
          .order('order_date', { ascending: true }));

      // Get purchase orders for reference (COGS, not expenses)
      const purchaseData = await fetchAllPaginated<any>(() =>
        supabase
          .from('purchase_orders')
          .select('total_amount, order_date, created_at')
          .gte('order_date', format(startDate, 'yyyy-MM-dd'))
          .lte('order_date', format(endDate, 'yyyy-MM-dd'))
          .order('order_date', { ascending: true }));

      // Get OPERATING expenses from bank_transactions (excluding Purchase/Sales which are COGS/Revenue)
      const operatingExpensesRaw = await fetchAllPaginated<any>(() =>
        supabase
          .from('bank_transactions')
          .select('amount, transaction_date, category, description, reference_number, bank_account_id, is_reversed, reverses_transaction_id')
          .eq('transaction_type', 'EXPENSE')
          .not('category', 'in', COGS_CATEGORY_IN_FILTER)
          .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
          .lte('transaction_date', format(endDate, 'yyyy-MM-dd')));

      // Get bank balances (exclude audit/adjustment buckets)
      const { data: bankDataRaw } = await supabase
        .from('bank_accounts')
        .select('id, account_name, balance, bank_name')
        .eq('status', 'ACTIVE');
      const adjustmentBankIds = new Set(
        (bankDataRaw || []).filter(b => isAdjustmentBank(b.account_name)).map(b => b.id)
      );

      // Display-only details (type, lien, company, non-active accounts). Kept apart
      // from the figures above so a failure here can never change a total.
      const [detailRes, otherRes, companyRes] = await Promise.all([
        supabase.from('bank_accounts').select('id, account_type, account_status, lien_amount, subsidiary_id').eq('status', 'ACTIVE'),
        supabase.from('bank_accounts').select('id, account_name, balance, bank_name, status, lien_amount, subsidiary_id').neq('status', 'ACTIVE'),
        supabase.from('subsidiaries').select('id, firm_name'),
      ]);
      const companyById = new Map<string, string>(((companyRes.data || []) as any[]).map((c) => [c.id, c.firm_name]));
      const detailById = new Map<string, any>(((detailRes.data || []) as any[]).map((d) => [d.id, d]));
      const withCompany = (row: any, detail?: any) => {
        const subId = detail?.subsidiary_id ?? row.subsidiary_id;
        const firm = subId ? companyById.get(subId) : undefined;
        return { ...detail, ...row, subsidiaries: firm ? { firm_name: firm } : null };
      };
      const bankData = (bankDataRaw || [])
        .filter(b => !isAdjustmentBank(b.account_name))
        .map(b => withCompany(b, detailById.get(b.id)));
      // Accounts outside the Bank Balance figure that still hold money (display only).
      const otherBanks = ((otherRes.data || []) as any[])
        .filter((b) => !isAdjustmentBank(b.account_name) && Number(b.balance || 0) !== 0)
        .map((b) => withCompany(b));

      // Reversal / contra entries and audit-only adjustment buckets are ledger corrections, not expenses.
      const operatingExpenses = (operatingExpensesRaw || []).filter((t: any) =>
        isOperatingExpenseRow(t) && !(t.bank_account_id && adjustmentBankIds.has(t.bank_account_id))
      );

      // Get recent transactions
      const { data: transactionsData } = await supabase
        .from('bank_transactions')
        .select('id, amount, transaction_type, description, category, reference_number, transaction_date, bank_account_id')
        .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: false })
        .limit(50);

      // Cash flow ledger: all INCOME/EXPENSE bank movements in range (same ledger for both sides)
      const cashFlowRows = await fetchAllPaginated<any>(() =>
        supabase
          .from('bank_transactions')
          .select('amount, transaction_type, transaction_date, category, bank_account_id')
          .in('transaction_type', ['INCOME', 'EXPENSE'])
          .not('category', 'in', '("Payment Gateway Settlement","Settlement")')
          .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
          .lte('transaction_date', format(endDate, 'yyyy-MM-dd'))
          .order('transaction_date', { ascending: true }));

      const rangeDays = Math.max(
        1,
        Math.round((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / 86400000) + 1
      );
      const bucketMode: 'day' | 'month' = rangeDays > 62 ? 'month' : 'day';
      const buckets = new Map<string, { bucket: string; label: string; inflow: number; outflow: number; net: number }>();

      (cashFlowRows || []).forEach((tx) => {
        if (!tx.transaction_date) return;
        if (tx.bank_account_id && adjustmentBankIds.has(tx.bank_account_id)) return;
        const d = new Date(`${String(tx.transaction_date).slice(0, 10)}T00:00:00`);
        const key = bucketMode === 'day' ? format(d, 'yyyy-MM-dd') : format(d, 'yyyy-MM');
        const label = bucketMode === 'day' ? format(d, 'dd MMM') : format(d, 'MMM yy');
        if (!buckets.has(key)) buckets.set(key, { bucket: key, label, inflow: 0, outflow: 0, net: 0 });
        const b = buckets.get(key)!;
        const amt = Math.abs(Number(tx.amount) || 0);
        if (tx.transaction_type === 'INCOME') b.inflow += amt;
        else b.outflow += amt;
        b.net = b.inflow - b.outflow;
      });

      const cashFlowSeries = Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

      const totalRevenue = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      // Total Expenses = Operating Expenses only (NOT including purchases which are COGS)
      const totalExpenses = operatingExpenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
      const totalBankBalance = bankData?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;
      const netCashFlow = totalRevenue - totalExpenses;



      return {
        totalRevenue,
        totalExpenses,
        netCashFlow,
        totalBankBalance,
        bankAccounts: bankData || [],
        otherBankAccounts: otherBanks,
        recentTransactions: transactionsData || [],
        salesData: salesData || [],
        purchaseData: purchaseData || [],
        expenseCount: operatingExpenses.length,
        cashFlowSeries,
        cashFlowBucketMode: bucketMode
      };

    },
  });

  // ── Display-only derivations ────────────────────────────────────────────
  const cashFlow = useMemo(() => {
    const series = financialData?.cashFlowSeries || [];
    const moneyIn = series.reduce((s, b) => s + b.inflow, 0);
    const moneyOut = series.reduce((s, b) => s + b.outflow, 0);
    const biggestOut = series.reduce<typeof series[number] | null>((m, b) => (!m || b.outflow > m.outflow ? b : m), null);
    return {
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
      biggestOut,
      chart: series.map((b) => ({ label: b.label, inflow: b.inflow, outflow: -b.outflow, net: b.net })),
    };
  }, [financialData?.cashFlowSeries]);

  const companies = useMemo(() => {
    const accounts = (financialData?.bankAccounts || []) as any[];
    const map = new Map<string, { name: string; total: number; accounts: any[] }>();
    accounts.forEach((a) => {
      const firm = a.subsidiaries?.firm_name ? shortEntityName(a.subsidiaries.firm_name) : null;
      const key = firm || "__none";
      const cur = map.get(key) || { name: firm || "Company not set", total: 0, accounts: [] };
      cur.total += Number(a.balance) || 0;
      cur.accounts.push(a);
      map.set(key, cur);
    });
    const list = Array.from(map.values()).map((g) => ({ ...g, accounts: g.accounts.sort((x, y) => Number(y.balance) - Number(x.balance)) }));
    list.sort((a, b) => b.total - a.total);
    const known = list.some((g) => g.name !== "Company not set");
    return { list, known };
  }, [financialData?.bankAccounts]);
  const positiveBankMax = Math.max(1, ...((financialData?.bankAccounts || []) as any[]).map((a) => Number(a.balance) || 0));
  const companyMax = Math.max(1, ...companies.list.map((c) => c.total));

  const accountName = useMemo(() => {
    const m = new Map<string, string>();
    [...((financialData?.bankAccounts || []) as any[]), ...((financialData?.otherBankAccounts || []) as any[])].forEach((a) => m.set(a.id, a.account_name));
    return m;
  }, [financialData?.bankAccounts, financialData?.otherBankAccounts]);

  const formatCurrency = (amount: number) => {
    return `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const txPager = usePaged((financialData?.recentTransactions || []) as any[], 15, `${startStr}|${endStr}`);

  const updating = !!isPlaceholderData && isFetching;
  const composition = position
    ? [
        { key: 'bank', label: 'Banks', value: position.totalBank, color: palette.s1 },
        { key: 'pos', label: 'POS pending', value: position.totalGateway, color: palette.s2 },
        { key: 'stock', label: 'Stock at cost', value: position.stockVal, color: palette.s3 },
      ]
    : [];
  const compositionTotal = composition.reduce((s, c) => s + Math.max(0, c.value), 0);

  const exportFinancials = async (only?: 'cashflow') => {
    if (!financialData) return;
    try {
      setExporting(true);
      const cashSheet = {
        name: 'Cash flow',
        rows: (financialData.cashFlowSeries || []).map((b) => ({
          [financialData.cashFlowBucketMode === 'month' ? 'Month' : 'Date']: b.bucket,
          'Money in (₹)': +b.inflow.toFixed(2),
          'Money out (₹)': +b.outflow.toFixed(2),
          'Net (₹)': +b.net.toFixed(2),
        })),
      };
      if (only === 'cashflow') {
        await downloadWorkbook(`cash_flow_${startStr}_to_${endStr}`, [cashSheet]);
        return;
      }
      await downloadWorkbook(`financials_${startStr}_to_${endStr}`, [
        {
          name: 'Summary',
          rows: [
            { Figure: 'Period', Value: periodLabel },
            { Figure: 'Revenue (₹)', Value: +financialData.totalRevenue.toFixed(2) },
            { Figure: 'Operating expenses (₹)', Value: +financialData.totalExpenses.toFixed(2) },
            { Figure: 'Money in (₹)', Value: +cashFlow.moneyIn.toFixed(2) },
            { Figure: 'Money out (₹)', Value: +cashFlow.moneyOut.toFixed(2) },
            { Figure: 'Bank balance — active accounts (₹)', Value: +financialData.totalBankBalance.toFixed(2) },
            { Figure: 'Total asset value (₹)', Value: position ? +position.total.toFixed(2) : null },
            { Figure: 'Banks in asset value (₹)', Value: position ? +position.totalBank.toFixed(2) : null },
            { Figure: 'POS / gateway pending (₹)', Value: position ? +position.totalGateway.toFixed(2) : null },
            { Figure: 'Stock at cost (₹)', Value: position ? +position.stockVal.toFixed(2) : null },
            { Figure: 'Unpaid TDS (₹)', Value: position ? +position.totalUnpaidTds.toFixed(2) : null },
          ],
        },
        cashSheet,
        {
          name: 'Bank accounts',
          rows: [
            ...((financialData.bankAccounts || []) as any[]).map((a) => ({
              Company: a.subsidiaries?.firm_name ? shortEntityName(a.subsidiaries.firm_name) : '', Account: a.account_name, Bank: a.bank_name,
              Status: a.status, 'In bank balance': 'Yes', 'Lien (₹)': Number(a.lien_amount || 0), 'Balance (₹)': Number(a.balance || 0),
            })),
            ...((financialData.otherBankAccounts || []) as any[]).map((a) => ({
              Company: a.subsidiaries?.firm_name ? shortEntityName(a.subsidiaries.firm_name) : '', Account: a.account_name, Bank: a.bank_name,
              Status: a.status, 'In bank balance': 'No', 'Lien (₹)': Number(a.lien_amount || 0), 'Balance (₹)': Number(a.balance || 0),
            })),
          ],
        },
        {
          name: 'Latest transactions',
          rows: ((financialData.recentTransactions || []) as any[]).map((t) => ({
            Date: t.transaction_date, Type: TX_TYPE[t.transaction_type]?.label || t.transaction_type, Account: accountName.get(t.bank_account_id) || '',
            Category: t.category || '', Description: t.description || '', Reference: t.reference_number || '', 'Amount (₹)': Number(t.amount || 0),
          })),
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <PermissionGate
      permissions={["financials_view", "financials_manage"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center page-mount">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Financials.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="p-2 bg-muted rounded-md border border-border">
              <Calculator className="h-5 w-5 text-muted-foreground" />
            </span>
            Financials
          </span>
        }
        description="Where the money sits right now, and how it moved in the selected period"
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              preset={datePreset}
              onPresetChange={handleDatePresetChange}
              className="w-auto"
            />
            <Button variant="outline" size="sm" className="h-9" onClick={() => exportFinancials()} disabled={exporting || !financialData || updating}>
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Preparing…' : 'Export'}
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => navigate('/bams?tab=journal')}>
              <Plus className="h-4 w-4 mr-2" />
              New Transaction
            </Button>
          </div>
        }
      />

      {/* Right now — live position */}
      <section className="space-y-2.5">
        <StripHeading title="Right now" meta="Live position · refreshes every minute" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setAssetBreakdownOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAssetBreakdownOpen(true); } }}
            className="group min-w-0 cursor-pointer rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:col-span-8 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="t-label">Total asset value</p>
                {positionLoading && !position ? (
                  <div className="mt-2 h-9 w-40 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="mt-1 text-[2rem] font-semibold leading-tight tracking-tight text-foreground" title={formatExactINR(position?.total || 0)}>
                    {formatCompactINR(position?.total || 0)}
                  </p>
                )}
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatExactINR(position?.total || 0)} · Banks + POS + Stock − TDS</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                <Layers className="h-3.5 w-3.5" /> Breakdown <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {position && compositionTotal > 0 && (
              <>
                <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label="Asset composition">
                  {composition.filter((c) => c.value > 0).map((c) => (
                    <div key={c.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(c.value / compositionTotal) * 100}%`, background: c.color }} title={`${c.label}: ${inr(c.value)}`} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {composition.map((c) => (
                    <LegendKey key={c.key} color={c.color} label={c.label} value={formatCompactINR(c.value)} />
                  ))}
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-destructive/60" />
                    <span>Unpaid TDS</span>
                    <span className="font-medium tabular-nums text-destructive">−{formatCompactINR(position.totalUnpaidTds)}</span>
                  </span>
                </div>
              </>
            )}
            {assetTrend.points.length > 1 && (
              <div className="mt-4 border-t border-border/70 pt-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Daily snapshots, last 30 days</span>
                  <DeltaChip value={assetTrend.change} suffix={assetTrend.from ? `since ${format(new Date(assetTrend.from), 'dd MMM')}` : undefined} />
                </div>
                <div className="h-14">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={assetTrend.points} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                        content={({ active, payload }) => active && payload?.length ? (
                          <ChartTooltipBox title={(payload[0].payload as any).d} rows={[{ key: 'v', label: 'Asset value', value: formatCompactINR(Number(payload[0].value)), color: palette.s1 }]} />
                        ) : null}
                      />
                      <Area type="monotone" dataKey="v" stroke={palette.s1} fill={palette.s1} fillOpacity={0.1} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:col-span-4">
            <KpiTile
              className="col-span-2"
              label="Bank balance"
              value={formatCompactINR(financialData?.totalBankBalance || 0)}
              exact={formatExactINR(financialData?.totalBankBalance || 0)}
              sub={`${fmtCount((financialData?.bankAccounts || []).length)} active accounts`}
              icon={Wallet}
              to="/bams"
              cta="View accounts"
              loading={isLoading}
            />
            <KpiTile
              label="POS pending"
              value={formatCompactINR(position?.totalGateway || 0)}
              exact={formatExactINR(position?.totalGateway || 0)}
              sub={`${fmtCount(position?.pendingCount || 0)} settlements`}
              loading={positionLoading && !position}
            />
            <KpiTile
              label="Unpaid TDS"
              value={formatCompactINR(position?.totalUnpaidTds || 0)}
              exact={formatExactINR(position?.totalUnpaidTds || 0)}
              tone="negative"
              sub={`${fmtCount(position?.tdsCount || 0)} records`}
              loading={positionLoading && !position}
            />
          </div>
        </div>
      </section>

      {/* This period */}
      <section className="space-y-2.5">
        <StripHeading title="This period" meta={<span className="inline-flex items-center gap-2">{periodLabel} <UpdatingPill show={updating} /></span>} />
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 transition-opacity", updating && "opacity-60")}>
          <KpiTile
            label="Total revenue"
            value={formatCompactINR(financialData?.totalRevenue || 0)}
            exact={formatExactINR(financialData?.totalRevenue || 0)}
            sub={`${fmtCount((financialData?.salesData || []).length)} sales orders`}
            icon={TrendingUp}
            to="/sales"
            searchParams={{ dateFrom: startStr, dateTo: endStr }}
            cta="View sales"
            loading={isLoading}
          />
          <KpiTile
            label="Total expenses"
            value={formatCompactINR(financialData?.totalExpenses || 0)}
            exact={formatExactINR(financialData?.totalExpenses || 0)}
            sub={`${fmtCount(financialData?.expenseCount || 0)} operating entries`}
            info="Operating expenses only — purchases (stock), settlements and reversal/contra entries are left out."
            icon={BookOpen}
            to="/bams"
            searchParams={{ tab: 'journal', journalView: 'opex', dateFrom: startStr, dateTo: endStr }}
            cta="View transactions"
            loading={isLoading}
          />
          <KpiTile
            label="Money in"
            value={formatCompactINR(cashFlow.moneyIn)}
            exact={formatExactINR(cashFlow.moneyIn)}
            tone="positive"
            sub="Bank income, excl. gateway settlements"
            loading={isLoading}
          />
          <KpiTile
            label="Money out"
            value={formatCompactINR(cashFlow.moneyOut)}
            exact={formatExactINR(cashFlow.moneyOut)}
            tone="negative"
            sub="Bank expenses incl. purchases"
            loading={isLoading}
          />
          <KpiTile
            label="Net cash flow"
            value={formatCompactINR(cashFlow.net)}
            exact={formatExactINR(cashFlow.net)}
            tone={cashFlow.net >= 0 ? 'positive' : 'negative'}
            sub="Money in − money out"
            info="Bank INCOME minus EXPENSE rows in the period. Settlement and payment-gateway settlement rows are left out on both sides, as before."
            loading={isLoading}
          />
        </div>
      </section>

      {/* Financial Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="ds-subnav mb-4 flex h-auto w-full justify-start rounded-none bg-transparent p-0 print:hidden">
          {[
            { value: 'overview', label: 'Overview', short: 'Overview', icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { value: 'accounts', label: 'Bank Accounts', short: 'Banks', icon: <Landmark className="h-3.5 w-3.5" /> },
            { value: 'transactions', label: 'Transactions', short: 'Trans.', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
            { value: 'platform-fees', label: 'Platform Fees', short: 'Fees', icon: <Percent className="h-3.5 w-3.5" /> },
            { value: 'asset-history', label: 'Asset Value History', short: 'Assets', icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { value: 'reports', label: 'Reports', short: 'Reports', icon: <FileText className="h-3.5 w-3.5" /> },
          ].map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TAB_TRIGGER}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Panel
              className="xl:col-span-8"
              icon={BarChart3}
              title="Cash flow"
              description={`Money in vs money out (${financialData?.cashFlowBucketMode === 'month' ? 'monthly' : 'daily'}) · ${periodLabel} · excludes gateway settlements (internal transfers)`}
              footer={
                cashFlow.biggestOut && cashFlow.biggestOut.outflow > 0
                  ? <>Biggest money-out {financialData?.cashFlowBucketMode === 'month' ? 'month' : 'day'}: <span className="font-medium text-foreground">{cashFlow.biggestOut.label}</span> ({inr(cashFlow.biggestOut.outflow)}). Gateway settlements are internal transfers and are not part of this chart.</>
                  : 'Gateway settlements are internal transfers and are not part of this chart.'
              }
            >
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
                <LegendKey color={palette.positive} label="Money in" value={formatCompactINR(cashFlow.moneyIn)} />
                <LegendKey color={palette.negative} label="Money out" value={formatCompactINR(cashFlow.moneyOut)} />
                <LegendKey color={palette.s3} shape="line" label="Net" value={formatCompactINR(cashFlow.net)} />
              </div>
              <div className={cn("h-72 transition-opacity", updating && "opacity-60")}>
                {cashFlow.chart.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No cash movements in the selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashFlow.chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign" barCategoryGap="25%">
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                      <YAxis {...axisProps} width={60} tickFormatter={axisInr} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                        content={({ active, payload, label }) => active && payload?.length ? (
                          <ChartTooltipBox
                            title={label}
                            rows={[
                              { key: 'in', label: 'Money in', value: formatExactINR(Number(payload.find((p: any) => p.dataKey === 'inflow')?.value || 0)), color: palette.positive },
                              { key: 'out', label: 'Money out', value: formatExactINR(Math.abs(Number(payload.find((p: any) => p.dataKey === 'outflow')?.value || 0))), color: palette.negative },
                              { key: 'net', label: 'Net', value: formatExactINR(Number(payload.find((p: any) => p.dataKey === 'net')?.value || 0)), color: palette.s3 },
                            ]}
                          />
                        ) : null}
                      />
                      <Bar dataKey="inflow" name="Money In" stackId="flow" fill={palette.positive} maxBarSize={24} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outflow" name="Money Out" stackId="flow" fill={palette.negative} maxBarSize={24} radius={[0, 0, 4, 4]} />
                      <Line type="monotone" dataKey="net" name="Net" stroke={palette.s3} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel
              className="xl:col-span-4"
              icon={Building}
              title="Cash by company"
              description="Active bank balances per entity"
            >
              {!companies.known ? (
                <EmptyState
                  icon={Building}
                  title="Company split not available"
                  description="Bank accounts aren't linked to companies, or your role can't view company records."
                  className="py-8"
                />
              ) : (
                <div className="space-y-3">
                  {companies.list.map((c) => (
                    <div key={c.name}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-foreground">{c.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" title={formatExactINR(c.total)}>{formatCompactINR(c.total)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ShareBar value={Math.max(0, c.total)} max={companyMax} />
                        <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                          {c.accounts.length} {c.accounts.length === 1 ? 'account' : 'accounts'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">
                    Total {formatCompactINR(financialData?.totalBankBalance || 0)} across {fmtCount((financialData?.bankAccounts || []).length)} active accounts.
                  </p>
                </div>
              )}
            </Panel>
          </div>

          <Panel icon={PieChart} title="Shortcuts" description="Jump to where the work is done">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { key: 'record', icon: Plus, title: 'Record income or expense', text: 'BAMS → Journal entries', onClick: () => navigate('/bams?tab=journal') },
                { key: 'pnl', icon: TrendingUp, title: 'Profit & Loss statement', text: 'Spread, costs and net result', onClick: () => navigate('/profit-loss') },
                { key: 'bs', icon: FileText, title: 'Balance sheet', text: 'Company-wise, ledger-supported', onClick: () => setBalanceSheetOpen(true) },
                { key: 'stats', icon: BarChart3, title: 'Expense analytics', text: 'Statistics → Financial', onClick: () => navigate('/statistics?tab=financial') },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={s.onClick}
                  className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="rounded-md bg-muted p-2 text-muted-foreground group-hover:text-foreground"><s.icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{s.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.text}</span>
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="accounts" className="mt-0 space-y-4">
          <Panel
            icon={Landmark}
            title="Bank accounts"
            description={`${fmtCount((financialData?.bankAccounts || []).length)} active accounts · ${formatCompactINR(financialData?.totalBankBalance || 0)}`}
            actions={<Button variant="outline" size="sm" onClick={() => navigate('/bams')}>Manage in BAMS</Button>}
            bodyClassName="p-0 sm:p-0"
          >
            {(financialData?.bankAccounts || []).length === 0 ? (
              <EmptyState icon={Building} title="No bank accounts found" description="Add bank accounts to track balances" />
            ) : (
              <div className="px-4 py-4 sm:px-5">
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="hidden w-[18%] lg:table-cell">Share of total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.list.map((c) => (
                      <Fragment key={c.name}>
                        {companies.known && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={3} className="py-2">
                              <span className="text-sm font-semibold text-foreground">{c.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{c.accounts.length} {c.accounts.length === 1 ? 'account' : 'accounts'}</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2 text-right text-sm font-semibold font-mono text-[13px] tabular-nums text-foreground">{formatCurrency(c.total)}</TableCell>
                            <TableCell className="hidden py-2 lg:table-cell" />
                          </TableRow>
                        )}
                        {c.accounts.map((account: any) => {
                          const bal = Number(account.balance) || 0;
                          const lien = Number(account.lien_amount) || 0;
                          const bankStatus = account.account_status && account.account_status !== 'ACTIVE' ? account.account_status : null;
                          return (
                            <TableRow key={account.id}>
                              <TableCell>
                                <p className="text-sm font-medium text-foreground">{account.account_name}</p>
                                <p className="text-xs text-muted-foreground">{account.bank_name}</p>
                              </TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{tidyLabel(account.account_type)}</TableCell>
                              <TableCell>
                                {lien > 0 || bankStatus ? (
                                  <div className="flex flex-wrap gap-1">
                                    {lien > 0 && <StatusChip tone="warning">Lien {formatCompactINR(lien)}</StatusChip>}
                                    {bankStatus && <StatusChip tone="neutral">Bank: {tidyLabel(bankStatus)}</StatusChip>}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", bal < 0 ? "text-destructive" : "text-foreground")}>
                                {formatCurrency(bal)}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <ShareBar value={Math.max(0, bal)} max={positiveBankMax} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          {(financialData?.otherBankAccounts || []).length > 0 && (
            <Panel
              icon={AlertTriangle}
              title="Holding money but not in Bank balance"
              description="Accounts that aren't Active. Dormant accounts still count in Total asset value; inactive and pending ones don't."
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {((financialData?.otherBankAccounts || []) as any[]).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{a.account_name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <StatusChip tone={a.status === 'DORMANT' ? 'info' : 'warning'}>{tidyLabel(String(a.status).replace(/_/g, ' '))}</StatusChip>
                        {a.subsidiaries?.firm_name && <span className="text-[11px] text-muted-foreground">{shortEntityName(a.subsidiaries.firm_name)}</span>}
                      </div>
                    </div>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", Number(a.balance) < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(Number(a.balance) || 0)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-0 space-y-4">
          <Panel
            icon={ArrowRightLeft}
            title="Recent transactions"
            description={`Latest bank movements in ${periodLabel}`}
            actions={<Button variant="outline" size="sm" onClick={() => navigate('/bams?tab=journal')}>Open BAMS journal</Button>}
          >
            {(financialData?.recentTransactions || []).length === 0 ? (
              <EmptyState icon={ArrowRightLeft} title="No transactions found" description="Transactions will appear here" />
            ) : (
              <>
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden md:table-cell">Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txPager.slice.map((t: any) => {
                      const meta = TX_TYPE[t.transaction_type] || { label: tidyLabel(t.transaction_type), sign: -1, tone: 'neutral' as const };
                      return (
                        <ClickableRow key={t.id} txType="bank_transaction" txId={t.id} className="hover:bg-muted/40" {...rowOpenProps('bank_transaction', t.id)}>
                          <TableCell className="whitespace-nowrap text-sm">{format(new Date(t.transaction_date), "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">{t.description || t.category || 'Transaction'}</p>
                            <p className="text-xs text-muted-foreground">{[t.category, t.reference_number].filter(Boolean).join(' · ') || '—'}</p>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{accountName.get(t.bank_account_id) || '—'}</TableCell>
                          <TableCell><StatusChip tone={meta.tone}>{meta.label}</StatusChip></TableCell>
                          <TableCell className={cn("whitespace-nowrap text-right font-semibold tabular-nums", meta.sign > 0 ? "text-success" : "text-destructive")}>
                            {meta.sign > 0 ? '+' : '−'}{formatCurrency(Number(t.amount))}
                          </TableCell>
                        </ClickableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <TablePager {...txPager} noun="latest movements" />
                <p className="px-1 pt-1 text-xs text-muted-foreground">Up to 50 most recent movements of the period. Click a row for full details.</p>
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="reports" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { key: 'pnl', icon: TrendingUp, title: 'Profit & Loss', text: 'Comprehensive P&L statement — spread, costs, trades and expenses.', action: 'Open statement', onClick: () => navigate('/profit-loss') },
              { key: 'cf', icon: BarChart3, title: 'Cash Flow', text: `Money in and out for ${periodLabel}, as an Excel file.`, action: exporting ? 'Preparing…' : 'Download Excel', onClick: () => exportFinancials('cashflow'), disabled: exporting || !financialData || updating },
              { key: 'bs', icon: PieChart, title: 'Balance Sheet', text: 'Company-wise, ledger-supported.', action: 'Generate Report', onClick: () => setBalanceSheetOpen(true) },
            ].map((r) => (
              <Panel key={r.key}>
                <div className="flex h-full flex-col">
                  <span className="w-fit rounded-md bg-muted p-2.5 text-muted-foreground"><r.icon className="h-5 w-5" /></span>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{r.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.text}</p>
                  <Button size="sm" variant={r.key === 'bs' ? 'default' : 'outline'} className="mt-4 w-fit" onClick={r.onClick} disabled={r.disabled}>
                    {r.action}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        </TabsContent>

        {/* Platform Fees Tab */}
        <TabsContent value="platform-fees" className="mt-0 space-y-6">
          <PlatformFeesSummary startDate={startDate} endDate={endDate} />
        </TabsContent>

        {/* Asset Value History Tab */}
        <TabsContent value="asset-history" className="mt-0 space-y-6">
          <AssetValueHistoryTab />
        </TabsContent>
      </Tabs>

      <BalanceSheetDialog open={balanceSheetOpen} onOpenChange={setBalanceSheetOpen} />
      <TotalAssetValueDialog open={assetBreakdownOpen} onOpenChange={setAssetBreakdownOpen} />
    </div>
    </PermissionGate>
  );
}
