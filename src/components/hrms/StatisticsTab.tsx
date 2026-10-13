import { useState, useMemo, Fragment, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerStatExcluded } from "@/lib/ownerStatsExclusion";
import { usersDirectory } from "@/lib/usersDirectory";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import {
  TrendingUp, Users, DollarSign, Building,
  FileBarChart, UserCheck, Download, BarChart3, Briefcase,
  Target, UserPlus, Clock, CheckCircle, XCircle, AlertCircle, Phone, Award, Coins, ShoppingCart, MapPin, ChevronDown, ChevronRight, Receipt
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { format, startOfMonth, endOfMonth, subDays, differenceInDays, startOfDay, endOfDay, addMonths, addDays } from "date-fns";
import { ExpenseCategoryDrillDown } from "./ExpenseCategoryDrillDown";
import { IncomeCategoryDrillDown } from "./IncomeCategoryDrillDown";
import { isReversalTransaction } from "@/lib/isReversalTransaction";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  Panel,
  KpiTile,
  DeltaChip,
  ShareBar,
  StatusChip,
  LegendKey,
  TablePager,
  UpdatingPill,
  usePaged,
  ChartTooltipBox,
  axisProps,
  gridProps,
  axisInr,
  useChartPalette,
  downloadWorkbook,
  formatExactINR,
  formatCompactINR,
  splitCategory,
  count as fmtCount,
} from "@/components/finance-ui";

const PAYOUT_GATEWAY_FEE_CATEGORY = 'Finance, Banking & Compliance > Payout Gateway Fee';

const normalizeExpenseCategory = (category?: string | null, description?: string | null) => {
  const descriptionText = String(description || '').toLowerCase();
  if (category === PAYOUT_GATEWAY_FEE_CATEGORY || descriptionText.includes('payout gateway fee')) {
    return 'Payout Gateway Fee';
  }
  return category || 'Other';
};

const TAB_TRIGGER =
  "ds-subnav-item rounded-none bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none flex items-center gap-1.5";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** IST weekday (0 = Mon) and hour for a timestamp, independent of the viewer's timezone. */
function istSlot(iso?: string | null): { day: number; hour: number } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return null;
  const ist = new Date(t + 330 * 60 * 1000);
  return { day: (ist.getUTCDay() + 6) % 7, hour: ist.getUTCHours() };
}

/** Fixed-height chart frame that dims while a new period loads. */
function ChartBox({ children, height = "h-64", dim = false }: { children: ReactNode; height?: string; dim?: boolean }) {
  return <div className={cn(height, "transition-opacity", dim && "opacity-60")}>{children}</div>;
}

interface StatisticsTabProps {
  /** Renders the page header with this tab's controls on the same row. */
  renderHeader?: (actions: ReactNode) => ReactNode;
}

export function StatisticsTab({ renderHeader }: StatisticsTabProps = {}) {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last30days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last30days"));
  const [activeTab, setActiveTab] = useState(tabFromUrl || "overview");
  const palette = useChartPalette();

  const getDateRange = () => {
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    const now = new Date();
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  };

  // Fetch comprehensive statistics data
  const { data: statsData, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['statistics_dashboard_enhanced', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    // Keep the previous period on screen (dimmed) while a new one loads.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Normalize dates for timestamp comparisons (clients use created_at timestamp)
      const periodStart = startOfDay(startDate);
      const periodEnd = endOfDay(endDate);

      // Get previous period for comparison (equal-length preceding window)
      const periodDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));
      const prevPeriodEnd = new Date(periodStart.getTime() - 1); // 1ms before current period start
      const prevPeriodStart = startOfDay(subDays(periodStart, periodDays));
      const prevStartStr = format(prevPeriodStart, 'yyyy-MM-dd');
      const prevEndStr = format(prevPeriodEnd, 'yyyy-MM-dd');

      // Every read below is independent, so they run in parallel. The queries
      // themselves are unchanged (only extra display columns were added).
      // NOTE: a stable .order('id') is REQUIRED on paginated reads. Without a
      // deterministic sort, PostgREST .range() pagination returns duplicated/skipped
      // rows across pages once the result exceeds 1000 rows, corrupting totals.
      const [
        salesOrders,
        prevSalesOrders,
        purchaseOrders,
        allClients,
        leads,
        hrEmployees,
        onboardingApprovals,
        expensesRaw,
        incomes,
        usdtFees,
        grossProfitRes,
      ] = await Promise.all([
        // Sales orders with client info (paginated — date ranges can exceed 1000 rows)
        fetchAllPaginated<any>(() =>
          supabase
            .from('sales_orders')
            .select('id, total_amount, order_date, status, payment_status, quantity, price_per_unit, client_name, client_id, client_phone, client_state, created_at, created_by')
            .gte('order_date', startStr)
            .lte('order_date', endStr)
            .order('id', { ascending: true })),
        // Previous period sales
        fetchAllPaginated<any>(() =>
          supabase
            .from('sales_orders')
            .select('id, total_amount')
            .gte('order_date', prevStartStr)
            .lte('order_date', prevEndStr)
            .order('id', { ascending: true })),
        // Purchase orders
        fetchAllPaginated<any>(() =>
          supabase
            .from('purchase_orders')
            .select('id, total_amount, order_date, status, supplier_name, created_by, created_at')
            .gte('order_date', startStr)
            .lte('order_date', endStr)
            .order('id', { ascending: true })),
        // ALL clients to track new additions
        fetchAllPaginated<any>(() =>
          supabase
            .from('clients')
            .select('id, created_at, kyc_status, client_type, name, date_of_onboarding, is_buyer, is_seller, buyer_approval_status, seller_approval_status, assigned_operator')
            .order('id', { ascending: true })),
        // Leads
        fetchAllPaginated<any>(() =>
          supabase
            .from('leads')
            .select('id, status, created_at, name, lead_type, estimated_order_value, contact_channel')
            .order('id', { ascending: true })),
        // Employees from hr_employees (source of truth)
        fetchAllPaginated<any>(() =>
          supabase
            .from('hr_employees')
            .select('id, first_name, last_name, is_active, total_salary, created_at, email, hr_employee_work_info!hr_employee_work_info_employee_id_fkey(department_id, job_role, departments(name))')
            .order('id', { ascending: true })),
        // Client onboarding approvals (paginated — exceeds 1000 rows)
        fetchAllPaginated<any>(() =>
          supabase
            .from('client_onboarding_approvals')
            .select('id, approval_status, created_at, reviewed_at, client_name, order_amount')
            .order('id', { ascending: true })),
        // Operating expenses (paginated to avoid the silent 1000-row cap,
        // which previously made category totals and drill-downs disagree).
        fetchAllPaginated<any>(() =>
          supabase
            .from('bank_transactions')
            .select('id, amount, category, description, transaction_date, reference_number')
            .eq('transaction_type', 'EXPENSE')
            .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","OPENING_BALANCE","ADJUSTMENT","Manual Baseline Reset")')
            .gte('transaction_date', startStr)
            .lte('transaction_date', endStr)
            .order('id', { ascending: true })),
        // Non-core incomes (same shape as expenses; settlement / adjustment
        // buckets excluded so they don't inflate the breakdown)
        fetchAllPaginated<any>(() =>
          supabase
            .from('bank_transactions')
            .select('id, amount, category, description, transaction_date, reference_number')
            .eq('transaction_type', 'INCOME')
            .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","OPENING_BALANCE","ADJUSTMENT","Manual Baseline Reset","Settlement","Payment Gateway Settlement")')
            .gte('transaction_date', startStr)
            .lte('transaction_date', endStr)
            .order('id', { ascending: true })),
        // USDT fees from wallet_transactions (PLATFORM_FEE, TRANSFER_FEE, etc.)
        // Paginated + ordered: busy months exceed 1000 fee rows, and a silent cap
        // here would undercount fees and overstate Net Profit.
        fetchAllPaginated<any>(() =>
          supabase
            .from('wallet_transactions')
            .select(`
              id,
              amount,
              reference_type,
              reference_id,
              description,
              created_at,
              wallets:wallet_id (wallet_name, wallet_type)
            `)
            .in('reference_type', ['PLATFORM_FEE', 'TRANSFER_FEE', 'SALES_ORDER_FEE', 'PURCHASE_ORDER_FEE'])
            .eq('transaction_type', 'DEBIT')
            .gte('created_at', startStr)
            .lte('created_at', endStr + 'T23:59:59')
            .order('id', { ascending: true })),
        // Profit metrics from daily_gross_profit_history (source of truth for P&L)
        supabase
          .from('daily_gross_profit_history')
          .select('gross_profit, effective_purchase_rate, total_sales_qty')
          .gte('snapshot_date', startStr)
          .lte('snapshot_date', endStr),
      ]);
      const grossProfitData = grossProfitRes.data;

      // Clients created in this period (new clients) - use normalized timestamps
      const newClientsInPeriod = allClients?.filter(c => {
        const createdDate = new Date(c.created_at);
        return createdDate >= periodStart && createdDate <= periodEnd;
      }) || [];

      // Clients from previous period
      const newClientsInPrevPeriod = allClients?.filter(c => {
        const createdDate = new Date(c.created_at);
        return createdDate >= prevPeriodStart && createdDate <= prevPeriodEnd;
      }) || [];

      // Leads in current period
      const leadsInPeriod = leads?.filter(l => {
        const createdDate = new Date(l.created_at);
        return createdDate >= periodStart && createdDate <= periodEnd;
      }) || [];

      // Leads in previous period
      const leadsInPrevPeriod = leads?.filter(l => {
        const createdDate = new Date(l.created_at);
        return createdDate >= prevPeriodStart && createdDate <= prevPeriodEnd;
      }) || [];

      // Map to compatible format. Owners/directors are left out of every
      // statistic on this tab (headcount, department mix, monthly payroll cost)
      // so the numbers match Reports & Analytics.
      const employees = hrEmployees?.filter(e => !isOwnerStatExcluded(e)).map(e => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name || ''}`.trim(),
        department: (e.hr_employee_work_info as any)?.[0]?.departments?.name || 'N/A',
        status: e.is_active ? 'ACTIVE' : 'INACTIVE',
        salary: Number(e.total_salary || 0),
        created_at: e.created_at,
        designation: (e.hr_employee_work_info as any)?.[0]?.job_role || 'N/A',
        email: e.email
      })) || [];

      // Onboarding in period
      const onboardingInPeriod = onboardingApprovals?.filter(a => {
        const createdDate = new Date(a.created_at);
        return createdDate >= periodStart && createdDate <= periodEnd;
      }) || [];

      // Reversal / contra entries (e.g. settlement reversals booked as EXPENSE)
      // are ledger corrections, never real expenses.
      const expenses = (expensesRaw || []).filter(e => !isReversalTransaction(e));

      // Calculate core KPIs
      const currentRevenue = salesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const prevRevenue = prevSalesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      const totalTrades = (salesOrders?.length || 0) + (purchaseOrders?.length || 0);
      const totalClients = allClients?.length || 0;
      const totalEmployees = employees?.filter(e => e.status === 'ACTIVE')?.length || 0;

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

      const totalGrossProfit = grossProfitData?.reduce((sum, d) => sum + Number(d.gross_profit || 0), 0) || 0;

      // Calculate avg purchase rate (weighted by sales qty) for USDT fee INR conversion
      const totalSalesQtyPnl = grossProfitData?.reduce((sum, d) => sum + Number(d.total_sales_qty || 0), 0) || 0;
      const weightedPurchaseRateSum = grossProfitData?.reduce((sum, d) =>
        sum + (Number(d.effective_purchase_rate || 0) * Number(d.total_sales_qty || 0)), 0) || 0;
      const avgPurchaseRate = totalSalesQtyPnl > 0 ? weightedPurchaseRateSum / totalSalesQtyPnl : 0;

      // USDT fees in INR = total USDT fees × avg purchase rate
      const totalUsdtFeesRaw = usdtFees?.reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const usdtFeesInr = totalUsdtFeesRaw * avgPurchaseRate;

      // Net Profit = Gross Profit - Operating Expenses - USDT Fees (in INR)
      const netProfit = totalGrossProfit - totalExpenses - usdtFeesInr;

      // ===== KYC & CLIENT STATISTICS (period-aware) =====
      // All-time totals (for verification rate denominator)
      const kycVerifiedAllTime = allClients?.filter(c => c.kyc_status === 'VERIFIED' || c.kyc_status === 'APPROVED')?.length || 0;

      // Period-specific KYC counts (clients created in period by status)
      const kycVerified = newClientsInPeriod.filter(c => c.kyc_status === 'VERIFIED' || c.kyc_status === 'APPROVED').length;
      const kycPending = newClientsInPeriod.filter(c => c.kyc_status === 'PENDING').length;
      const kycRejected = newClientsInPeriod.filter(c => c.kyc_status === 'REJECTED').length;

      // New KYC verified in period
      const newKycVerifiedInPeriod = kycVerified;

      // Buyer/Seller stats (period-specific)
      const buyersTotal = newClientsInPeriod.filter(c => c.is_buyer).length;
      const sellersTotal = newClientsInPeriod.filter(c => c.is_seller).length;
      const newBuyers = buyersTotal;
      const newSellers = sellersTotal;

      // ===== LEAD STATISTICS (period-aware) =====
      const newLeads = leadsInPeriod.length;
      const prevNewLeads = leadsInPrevPeriod.length;
      const leadsChange = prevNewLeads > 0 ? ((newLeads - prevNewLeads) / prevNewLeads) * 100 : 0;

      const convertedLeads = leadsInPeriod.filter(l => l.status === 'CONVERTED').length;
      const openLeads = leadsInPeriod.filter(l => l.status === 'NEW' || l.status === 'CONTACTED' || l.status === 'FOLLOW_UP').length;
      const lostLeads = leadsInPeriod.filter(l => l.status === 'LOST').length;

      const conversionRate = newLeads > 0 ? (convertedLeads / newLeads) * 100 : 0;

      // Lead sources breakdown
      const leadSources = new Map<string, { count: number; converted: number }>();
      leadsInPeriod.forEach(lead => {
        const source = lead.contact_channel || 'Direct';
        if (!leadSources.has(source)) {
          leadSources.set(source, { count: 0, converted: 0 });
        }
        const current = leadSources.get(source)!;
        current.count++;
        if (lead.status === 'CONVERTED') current.converted++;
      });

      const leadSourceData = Array.from(leadSources.entries()).map(([name, data]) => ({
        name,
        leads: data.count,
        converted: data.converted,
        rate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0
      })).sort((a, b) => b.leads - a.leads);

      // ===== ONBOARDING STATISTICS =====
      const pendingOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'PENDING').length;
      const approvedOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'APPROVED').length;
      const rejectedOnboarding = onboardingInPeriod.filter(a => a.approval_status === 'REJECTED').length;
      const totalOnboardingValue = onboardingInPeriod
        .filter(a => a.approval_status === 'APPROVED')
        .reduce((sum, a) => sum + Number(a.order_amount || 0), 0);

      // ===== EMPLOYEE PERFORMANCE =====
      // Group by assigned_operator for client additions
      const operatorClientStats = new Map<string, { clientsAdded: number; ordersHandled: number; revenue: number }>();

      newClientsInPeriod.forEach(client => {
        const operator = client.assigned_operator || 'Unassigned';
        if (!operatorClientStats.has(operator)) {
          operatorClientStats.set(operator, { clientsAdded: 0, ordersHandled: 0, revenue: 0 });
        }
        operatorClientStats.get(operator)!.clientsAdded++;
      });

      const employeePerformanceData = Array.from(operatorClientStats.entries())
        .filter(([name]) => name !== 'System' && name !== 'Unassigned')
        .map(([name, data]) => ({
          name: name.split('@')[0] || name,
          clientsAdded: data.clientsAdded,
          ordersHandled: data.ordersHandled,
          revenue: data.revenue
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // Desk performance — orders each staff member entered (sales + purchase created_by).
      const deskMap = new Map<string, { sell: number; buy: number; sellValue: number; buyValue: number }>();
      const addDesk = (userId: string | null | undefined, side: 'sell' | 'buy', value: number) => {
        const key = userId || '__none';
        const cur = deskMap.get(key) || { sell: 0, buy: 0, sellValue: 0, buyValue: 0 };
        if (side === 'sell') { cur.sell++; cur.sellValue += value; } else { cur.buy++; cur.buyValue += value; }
        deskMap.set(key, cur);
      };
      (salesOrders || []).forEach(o => addDesk(o.created_by, 'sell', Number(o.total_amount || 0)));
      (purchaseOrders || []).forEach(o => addDesk(o.created_by, 'buy', Number(o.total_amount || 0)));
      const deskIds = Array.from(deskMap.keys()).filter(k => k !== '__none');
      let directory: any[] = [];
      if (deskIds.length > 0) {
        try {
          const { data } = await usersDirectory()
            .select('id, username, first_name, last_name')
            .in('id', deskIds);
          directory = data || [];
        } catch { directory = []; }
      }
      const dirMap = new Map<string, any>(directory.map((u: any) => [u.id, u]));
      const deskPerformance = Array.from(deskMap.entries())
        .filter(([id]) => {
          const u = dirMap.get(id);
          // Owners/directors stay out of staff statistics, as everywhere on this page.
          return !(u && isOwnerStatExcluded({ first_name: u.first_name, last_name: u.last_name }));
        })
        .map(([id, v]) => {
          const u = dirMap.get(id);
          const name = id === '__none'
            ? 'Not recorded'
            : u ? (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : (u.username || `User ${id.slice(0, 8)}`)) : `User ${id.slice(0, 8)}`;
          return { id, name, ...v, volume: v.sellValue + v.buyValue, orders: v.sell + v.buy };
        })
        .sort((a, b) => b.volume - a.volume);

      // ===== PERIOD-AWARE TREND DATA =====
      const trendData: any[] = [];
      const totalDays = differenceInDays(endDate, startDate);

      if (totalDays <= 31) {
        // Daily granularity for short periods
        let cursor = new Date(startDate);
        while (cursor <= endDate) {
          const dayStr = format(cursor, 'yyyy-MM-dd');
          const daySales = salesOrders?.filter(o => o.order_date?.startsWith(dayStr)) || [];
          const dayPurchases = purchaseOrders?.filter(o => o.order_date?.startsWith(dayStr)) || [];
          const dayNewClients = allClients?.filter(c => format(new Date(c.created_at), 'yyyy-MM-dd') === dayStr) || [];
          const dayLeads = leads?.filter(l => format(new Date(l.created_at), 'yyyy-MM-dd') === dayStr) || [];
          const dayRevenue = daySales.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

          trendData.push({
            month: format(cursor, 'dd MMM'),
            trades: daySales.length + dayPurchases.length,
            sales: daySales.length,
            purchases: dayPurchases.length,
            revenue: dayRevenue,
            newClients: dayNewClients.length,
            newLeads: dayLeads.length,
            convertedLeads: dayLeads.filter(l => l.status === 'CONVERTED').length
          });
          cursor = addDays(cursor, 1);
        }
      } else {
        // Monthly granularity for longer periods
        let current = startOfMonth(startDate);
        const lastMonth = startOfMonth(endDate);
        while (current <= lastMonth) {
          const mStart = format(current, 'yyyy-MM-dd');
          const mEnd = format(endOfMonth(current), 'yyyy-MM-dd');

          const monthSales = salesOrders?.filter(o => o.order_date >= mStart && o.order_date <= mEnd) || [];
          const monthPurchases = purchaseOrders?.filter(o => o.order_date >= mStart && o.order_date <= mEnd) || [];
          const monthNewClients = allClients?.filter(c => {
            const created = format(new Date(c.created_at), 'yyyy-MM-dd');
            return created >= mStart && created <= mEnd;
          }) || [];
          const monthLeads = leads?.filter(l => {
            const created = format(new Date(l.created_at), 'yyyy-MM-dd');
            return created >= mStart && created <= mEnd;
          }) || [];
          const monthRevenue = monthSales.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

          trendData.push({
            month: format(current, 'MMM yyyy'),
            trades: monthSales.length + monthPurchases.length,
            sales: monthSales.length,
            purchases: monthPurchases.length,
            revenue: monthRevenue,
            newClients: monthNewClients.length,
            newLeads: monthLeads.length,
            convertedLeads: monthLeads.filter(l => l.status === 'CONVERTED').length
          });
          current = addMonths(current, 1);
        }
      }

      // Busiest hours — orders by IST weekday × hour (sales + purchases, same rows as Trades).
      const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      [...(salesOrders || []), ...(purchaseOrders || [])].forEach(o => {
        const slot = istSlot(o.created_at);
        if (slot) heat[slot.day][slot.hour] += 1;
      });

      // Department distribution
      const departmentCounts = new Map<string, number>();
      employees?.filter(e => e.status === 'ACTIVE')?.forEach(emp => {
        const dept = emp.department || 'Other';
        departmentCounts.set(dept, (departmentCounts.get(dept) || 0) + 1);
      });
      const departmentData = Array.from(departmentCounts.entries()).map(([name, count]) => ({
        name,
        count
      }));

      // Expense breakdown by category
      const excludeExpenseCategories = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];
      const expenseByCategory = new Map<string, number>();
      expenses?.forEach(exp => {
        const cat = normalizeExpenseCategory(exp.category, exp.description);
        if (excludeExpenseCategories.includes(cat)) return;
        expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Number(exp.amount || 0));
      });
      const expenseBreakdown = Array.from(expenseByCategory.entries())
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Income breakdown by category
      // Core trading / settlement buckets can arrive in mixed case ("SALES"),
      // which slipped past the server-side exclusion list and inflated income.
      const coreIncomeBuckets = new Set([
        'purchase', 'sales', 'stock purchase', 'stock sale', 'trade', 'trading',
        'opening_balance', 'adjustment', 'manual baseline reset',
        'settlement', 'payment gateway settlement',
      ]);
      // Reversal / contra entries are ledger corrections, never income.
      const reportableIncomes = (incomes || []).filter(
        inc => !coreIncomeBuckets.has(String(inc.category || '').trim().toLowerCase())
          && !isReversalTransaction(inc)
      );
      const totalIncome = reportableIncomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
      const incomeByCategory = new Map<string, number>();
      reportableIncomes.forEach(inc => {
        const cat = inc.category || 'Other';
        incomeByCategory.set(cat, (incomeByCategory.get(cat) || 0) + Number(inc.amount || 0));
      });
      const incomeBreakdown = Array.from(incomeByCategory.entries())
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Calculate USDT fees totals
      const totalUsdtFees = usdtFees?.reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const platformFees = usdtFees?.filter(f => f.reference_type === 'PLATFORM_FEE').reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const transferFees = usdtFees?.filter(f => f.reference_type === 'TRANSFER_FEE').reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const salesOrderFees = usdtFees?.filter(f => f.reference_type === 'SALES_ORDER_FEE').reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
      const purchaseOrderFees = usdtFees?.filter(f => f.reference_type === 'PURCHASE_ORDER_FEE').reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;

      // Combined order fees (sales + purchase) - this is shown as "Order Fees" in the UI
      // Platform fees are the legacy type, Order fees are the new type from process_platform_fee_deduction
      const combinedOrderFees = platformFees + salesOrderFees + purchaseOrderFees;

      // Top clients by volume — grouped by client record (falling back to phone,
      // then the order's name) so two clients who share a name stay separate.
      const clientVolumes = new Map<string, { key: string; name: string; volume: number; trades: number }>();
      // Orders saved before the client record was linked carry only a phone: map
      // that phone to the client_id seen on the client's linked orders.
      const idByPhone = new Map<string, string>();
      salesOrders?.forEach(order => {
        if (order.client_id && order.client_phone && !idByPhone.has(order.client_phone)) idByPhone.set(order.client_phone, order.client_id);
      });
      salesOrders?.forEach(order => {
        const linkedId = order.client_id || (order.client_phone ? idByPhone.get(order.client_phone) : undefined);
        const key = linkedId ? `id:${linkedId}` : order.client_phone ? `ph:${order.client_phone}` : `nm:${order.client_name || 'Unknown'}`;
        if (!clientVolumes.has(key)) {
          clientVolumes.set(key, { key, name: order.client_name || 'Unknown', volume: 0, trades: 0 });
        }
        const stats = clientVolumes.get(key)!;
        stats.volume += Number(order.total_amount || 0);
        stats.trades++;
      });
      const rankedClients = Array.from(clientVolumes.values()).sort((a, b) => b.volume - a.volume);
      const topClients = rankedClients.slice(0, 10);
      const top10Volume = topClients.reduce((s, c) => s + c.volume, 0);

      // Revenue by client state (display only)
      const stateMap = new Map<string, { state: string; revenue: number; orders: number }>();
      let noStateRevenue = 0;
      salesOrders?.forEach(o => {
        const st = String(o.client_state || '').trim();
        const amt = Number(o.total_amount || 0);
        if (!st) { noStateRevenue += amt; return; }
        const cur = stateMap.get(st) || { state: st, revenue: 0, orders: 0 };
        cur.revenue += amt;
        cur.orders += 1;
        stateMap.set(st, cur);
      });
      const stateRevenue = Array.from(stateMap.values()).sort((a, b) => b.revenue - a.revenue);

      return {
        kpi: {
          revenue: currentRevenue,
          revenueChange,
          prevRevenue,
          clients: newClientsInPeriod.length,
          trades: totalTrades,
          employees: totalEmployees,
          profit: netProfit,
          grossProfit: totalGrossProfit,
          usdtFeesInr,
          salesCount: salesOrders?.length || 0,
          purchaseCount: purchaseOrders?.length || 0,
        },
        clientStats: {
          total: totalClients,
          newInPeriod: newClientsInPeriod.length,
          newInPrevPeriod: newClientsInPrevPeriod.length,
          buyers: buyersTotal,
          sellers: sellersTotal,
          newBuyers,
          newSellers
        },
        kycStats: {
          verified: kycVerified,
          pending: kycPending,
          rejected: kycRejected,
          newVerifiedInPeriod: newKycVerifiedInPeriod,
          verificationRate: newClientsInPeriod.length > 0 ? Math.round((kycVerified / newClientsInPeriod.length) * 100) : 0,
          verifiedAllTime: kycVerifiedAllTime,
          totalAllTime: allClients?.length || 0
        },
        leadStats: {
          total: leads?.length || 0,
          newInPeriod: newLeads,
          prevNewLeads,
          converted: convertedLeads,
          open: openLeads,
          lost: lostLeads,
          conversionRate,
          leadsChange,
          leadSourceData
        },
        onboardingStats: {
          pending: pendingOnboarding,
          approved: approvedOnboarding,
          rejected: rejectedOnboarding,
          totalValue: totalOnboardingValue
        },
        employeePerformance: employeePerformanceData,
        deskPerformance,
        trendData,
        heat,
        departmentData,
        expenseBreakdown,
        incomeBreakdown,
        totalIncome,
        topClients,
        clientCount: rankedClients.length,
        top10Volume,
        stateRevenue,
        noStateRevenue,
        totalExpenses,
        // hr_employees.total_salary is ANNUAL CTC (verified against razorpay-sourced
        // salary structures) — monthly payroll cost is the annual sum / 12.
        totalSalary: (employees?.filter(e => e.status === 'ACTIVE')?.reduce((sum, e) => sum + Number(e.salary || 0), 0) || 0) / 12,
        usdtFees: {
          total: totalUsdtFees,
          platform: combinedOrderFees, // Platform fees now aggregated with order fees
          transfer: transferFees,
          salesOrder: salesOrderFees,
          purchaseOrder: purchaseOrderFees,
          transactions: usdtFees || []
        }
      };
    },
  });

  // Same compact ₹ format as P&L and Financials (₹11.67 Cr / ₹39.35 L / ₹61.80 K), sign-aware.
  const formatCurrency = (value: number) => formatCompactINR(value);
  const formatSigned = formatCurrency;

  const formatUSDT = (value: number) => {
    return `${value.toFixed(4)} USDT`;
  };

  // State for fee history dialog
  const [showFeeHistoryDialog, setShowFeeHistoryDialog] = useState(false);

  // State for expense category drill-down
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string | null>(null);
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<string | null>(null);
  const [openHeads, setOpenHeads] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const groupByHead = (rows: { category: string; amount: number }[]) => {
    const map = new Map<string, { head: string; amount: number; items: { category: string; label: string; amount: number }[] }>();
    rows.forEach((r) => {
      const { head, sub } = splitCategory(r.category);
      const cur = map.get(head) || { head, amount: 0, items: [] };
      cur.amount += r.amount;
      cur.items.push({ category: r.category, label: sub || r.category, amount: r.amount });
      map.set(head, cur);
    });
    return Array.from(map.values())
      .map((g) => ({ ...g, items: g.items.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.amount - a.amount);
  };
  const expenseHeads = useMemo(() => groupByHead(statsData?.expenseBreakdown || []), [statsData?.expenseBreakdown]);
  const incomeHeads = useMemo(() => groupByHead(statsData?.incomeBreakdown || []), [statsData?.incomeBreakdown]);
  const feePager = usePaged((statsData?.usdtFees?.transactions || []) as any[], 25, showFeeHistoryDialog);

  const { kpi, clientStats, kycStats, leadStats, onboardingStats,
    employeePerformance, deskPerformance, trendData, heat, departmentData,
    topClients, clientCount, top10Volume, stateRevenue, noStateRevenue, totalExpenses, totalIncome, totalSalary, usdtFees
  } = statsData || {
    kpi: { revenue: 0, revenueChange: 0, prevRevenue: 0, clients: 0, trades: 0, employees: 0, profit: 0, grossProfit: 0, usdtFeesInr: 0, salesCount: 0, purchaseCount: 0 },
    clientStats: { total: 0, newInPeriod: 0, newInPrevPeriod: 0, buyers: 0, sellers: 0, newBuyers: 0, newSellers: 0 },
    kycStats: { verified: 0, pending: 0, rejected: 0, newVerifiedInPeriod: 0, verificationRate: 0, verifiedAllTime: 0, totalAllTime: 0 },
    leadStats: { total: 0, newInPeriod: 0, prevNewLeads: 0, converted: 0, open: 0, lost: 0, conversionRate: 0, leadsChange: 0, leadSourceData: [] },
    onboardingStats: { pending: 0, approved: 0, rejected: 0, totalValue: 0 },
    employeePerformance: [],
    deskPerformance: [],
    trendData: [],
    heat: Array.from({ length: 7 }, () => Array(24).fill(0)),
    departmentData: [],
    expenseBreakdown: [],
    incomeBreakdown: [],
    topClients: [],
    clientCount: 0,
    top10Volume: 0,
    stateRevenue: [],
    noStateRevenue: 0,
    totalExpenses: 0,
    totalIncome: 0,
    totalSalary: 0,
    usdtFees: { total: 0, platform: 0, transfer: 0, salesOrder: 0, purchaseOrder: 0, transactions: [] }
  };

  const clientGrowthChange = clientStats.newInPrevPeriod > 0
    ? ((clientStats.newInPeriod - clientStats.newInPrevPeriod) / clientStats.newInPrevPeriod) * 100
    : 0;

  const { startDate: rangeStart, endDate: rangeEnd } = getDateRange();
  const periodLabel = `${format(rangeStart, 'dd MMM')} – ${format(rangeEnd, 'dd MMM yyyy')}`;
  const updating = !!isPlaceholderData && isFetching;
  const heatMax = Math.max(1, ...heat.flat());
  const busiest = useMemo(() => {
    let best = { day: 0, hour: 0, n: 0 };
    heat.forEach((row, d) => row.forEach((n, h) => { if (n > best.n) best = { day: d, hour: h, n }; }));
    return best;
  }, [heat]);
  const deskMax = (deskPerformance as any[]).reduce<number>((m, d) => Math.max(m, d.volume), 0);
  const deskTotal = (deskPerformance as any[]).reduce<number>((s, d) => s + d.volume, 0);
  const stateMax = (stateRevenue as any[]).reduce<number>((m, s) => Math.max(m, s.revenue), 0);
  const expenseHeadMax = expenseHeads.reduce((m, h) => Math.max(m, h.amount), 0);
  const incomeHeadMax = incomeHeads.reduce((m, h) => Math.max(m, h.amount), 0);
  const kycTotal = kycStats.verified + kycStats.pending + kycStats.rejected;
  const onboardingTotal = onboardingStats.approved + onboardingStats.pending + onboardingStats.rejected;

  const handleExport = async () => {
    if (!statsData) return;
    try {
      setExporting(true);
      await downloadWorkbook(`statistics_${format(rangeStart, 'yyyy-MM-dd')}_to_${format(rangeEnd, 'yyyy-MM-dd')}`, [
        {
          name: 'Summary',
          rows: [
            { Figure: 'Period', Value: periodLabel },
            { Figure: 'Revenue (₹)', Value: +kpi.revenue.toFixed(2) },
            { Figure: 'Revenue change vs previous period (%)', Value: kpi.prevRevenue > 0 ? +kpi.revenueChange.toFixed(2) : null },
            { Figure: 'Net profit (₹)', Value: +kpi.profit.toFixed(2) },
            { Figure: 'Operating expenses (₹)', Value: +totalExpenses.toFixed(2) },
            { Figure: 'Other income (₹)', Value: +totalIncome.toFixed(2) },
            { Figure: 'Trades', Value: kpi.trades },
            { Figure: 'New clients', Value: clientStats.newInPeriod },
            { Figure: 'KYC verified (new clients)', Value: kycStats.verified },
            { Figure: 'New leads', Value: leadStats.newInPeriod },
            { Figure: 'Lead conversion (%)', Value: +leadStats.conversionRate.toFixed(1) },
            { Figure: 'Monthly salary (active CTC / 12) (₹)', Value: +totalSalary.toFixed(2) },
            { Figure: 'USDT fees', Value: +usdtFees.total.toFixed(4) },
          ],
        },
        { name: 'Trend', rows: trendData.map((t: any) => ({ Period: t.month, 'Revenue (₹)': +Number(t.revenue).toFixed(2), Trades: t.trades, 'Sell orders': t.sales, 'Buy orders': t.purchases, 'New clients': t.newClients, 'New leads': t.newLeads, Converted: t.convertedLeads })) },
        { name: 'Top clients', rows: topClients.map((c: any, i: number) => ({ Rank: i + 1, Client: c.name, Trades: c.trades, 'Volume (₹)': +c.volume.toFixed(2) })) },
        { name: 'Desk performance', rows: deskPerformance.map((d: any) => ({ Staff: d.name, 'Sell orders': d.sell, 'Buy orders': d.buy, 'Sell volume (₹)': +d.sellValue.toFixed(2), 'Buy volume (₹)': +d.buyValue.toFixed(2) })) },
        { name: 'Expenses', rows: (statsData.expenseBreakdown || []).map((e: any) => ({ Head: splitCategory(e.category).head, Category: e.category, 'Amount (₹)': +e.amount.toFixed(2), 'Share (%)': e.percentage })) },
        { name: 'Income', rows: (statsData.incomeBreakdown || []).map((e: any) => ({ Head: splitCategory(e.category).head, Category: e.category, 'Amount (₹)': +e.amount.toFixed(2), 'Share (%)': e.percentage })) },
        { name: 'States', rows: stateRevenue.map((s: any) => ({ State: s.state, Orders: s.orders, 'Revenue (₹)': +s.revenue.toFixed(2) })) },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const actions = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <UpdatingPill show={updating} />
      <DateRangePicker
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        preset={datePreset}
        onPresetChange={setDatePreset}
        className="min-w-[200px]"
      />
      <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={exporting || !statsData || updating}>
        <Download className="h-4 w-4 mr-2" />
        {exporting ? 'Preparing…' : 'Export'}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {renderHeader ? renderHeader(actions) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          Loading statistics...
        </div>
      </div>
    );
  }

  const headList = (
    heads: ReturnType<typeof groupByHead>,
    max: number,
    total: number,
    tone: "negative" | "positive",
    onPick: (category: string) => void,
    kind: string,
  ) => (
    <div className="space-y-1">
      {heads.map((h) => {
        const open = !!openHeads[`${kind}:${h.head}`];
        const single = h.items.length === 1 && h.items[0].category === h.head;
        return (
          <div key={h.head} className="rounded-md">
            <button
              type="button"
              onClick={() => (single ? onPick(h.items[0].category) : setOpenHeads((s) => ({ ...s, [`${kind}:${h.head}`]: !open })))}
              className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={single ? undefined : open}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                  {single ? <span className="w-3.5" /> : open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className={cn("truncate", single && "text-primary underline-offset-2 hover:underline")}>{h.head}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{formatCurrency(h.amount)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-5">
                <ShareBar value={h.amount} max={max} tone={tone} />
                <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                  {total > 0 ? `${Math.round((h.amount / total) * 100)}%` : '—'}
                </span>
              </div>
            </button>
            {open && !single && (
              <div className="mb-1 ml-7 space-y-0.5 border-l border-border pl-3">
                {h.items.map((it) => (
                  <button
                    key={it.category}
                    type="button"
                    onClick={() => onPick(it.category)}
                    className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate text-primary underline-offset-2 hover:underline">{it.label}</span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">{formatCurrency(it.amount)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {renderHeader ? renderHeader(actions) : <div className="flex justify-end">{actions}</div>}

      {/* Primary KPI Cards - Clickable */}
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 transition-opacity", updating && "opacity-60")}>
        <KpiTile
          label="Net Profit"
          value={formatSigned(kpi.profit)}
          exact={formatExactINR(kpi.profit)}
          tone={kpi.profit >= 0 ? "positive" : "negative"}
          sub={kpi.profit >= 0 ? "Profit" : "Loss"}
          info="Gross profit from the daily snapshots − operating expenses − USDT fees (valued at the period's average purchase rate)."
          icon={TrendingUp}
          to="/profit-loss"
          cta="Open P&L"
          emphasis
        />
        <KpiTile
          label="Revenue"
          value={formatCurrency(kpi.revenue)}
          exact={formatExactINR(kpi.revenue)}
          delta={<DeltaChip value={kpi.prevRevenue > 0 ? kpi.revenueChange : null} />}
          sub="vs previous period"
          icon={DollarSign}
          to="/sales"
          cta="View sales"
        />
        <KpiTile
          label="New Clients"
          value={fmtCount(clientStats.newInPeriod)}
          delta={<DeltaChip value={clientStats.newInPrevPeriod > 0 ? clientGrowthChange : null} />}
          sub="vs previous period"
          icon={UserPlus}
          to="/clients"
          cta="View clients"
        />
        <KpiTile
          label="KYC Verified"
          value={fmtCount(kycStats.newVerifiedInPeriod)}
          sub={`${kycStats.verificationRate}% of new clients`}
          icon={UserCheck}
          to="/clients"
          cta="View clients"
        />
        <KpiTile
          label="New Leads"
          value={fmtCount(leadStats.newInPeriod)}
          delta={<DeltaChip value={leadStats.prevNewLeads > 0 ? leadStats.leadsChange : null} />}
          sub="vs previous period"
          icon={Target}
          to="/leads"
          cta="View leads"
        />
        <KpiTile
          label="Lead conversion"
          value={`${leadStats.conversionRate.toFixed(1)}%`}
          sub={`${leadStats.converted} converted`}
          icon={CheckCircle}
          to="/leads"
          cta="View leads"
        />
      </div>

      {/* Tabs for Different Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="ds-subnav mb-4 flex h-auto w-full justify-start rounded-none bg-transparent p-0">
          <TabsTrigger value="overview" className={TAB_TRIGGER}><BarChart3 className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="clients" className={TAB_TRIGGER}><Users className="h-3.5 w-3.5" />Clients & KYC</TabsTrigger>
          <TabsTrigger value="leads" className={TAB_TRIGGER}><Target className="h-3.5 w-3.5" />Leads</TabsTrigger>
          <TabsTrigger value="performance" className={TAB_TRIGGER}><Award className="h-3.5 w-3.5" />Performance</TabsTrigger>
          <TabsTrigger value="financial" className={TAB_TRIGGER}><FileBarChart className="h-3.5 w-3.5" />Financial</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel icon={DollarSign} title="Revenue" description={`Sales value per ${trendData.length && String(trendData[0].month).length > 6 ? 'month' : 'day'} · ${periodLabel}`}>
              <ChartBox dim={updating}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} minTickGap={20} />
                    <YAxis {...axisProps} width={60} tickFormatter={axisInr} />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox title={label} rows={[{ key: 'r', label: 'Revenue', value: formatExactINR(Number(payload[0].value || 0)), color: palette.s1 }]} />
                      ) : null}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={palette.s1} fill={palette.s1} fillOpacity={0.1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBox>
            </Panel>

            <Panel
              icon={ShoppingCart}
              title="Trades"
              description={`${fmtCount(kpi.trades)} orders · ${fmtCount(kpi.salesCount)} sells, ${fmtCount(kpi.purchaseCount)} buys`}
              actions={<div className="flex gap-3"><LegendKey color={palette.s1} label="Sells" /><LegendKey color={palette.s2} label="Buys" /></div>}
            >
              <ChartBox dim={updating}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} minTickGap={20} />
                    <YAxis {...axisProps} width={40} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox
                          title={label}
                          rows={[
                            { key: 's', label: 'Sells', value: fmtCount(Number(payload.find((p: any) => p.dataKey === 'sales')?.value || 0)), color: palette.s1 },
                            { key: 'b', label: 'Buys', value: fmtCount(Number(payload.find((p: any) => p.dataKey === 'purchases')?.value || 0)), color: palette.s2 },
                          ]}
                        />
                      ) : null}
                    />
                    <Bar dataKey="sales" stackId="t" fill={palette.s1} maxBarSize={24} />
                    <Bar dataKey="purchases" stackId="t" fill={palette.s2} maxBarSize={24} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Panel
              className="xl:col-span-8"
              icon={Clock}
              title="Busiest hours"
              description="Orders entered by weekday and hour (IST), sells and buys together"
              footer={busiest.n > 0 ? <>Peak: <span className="font-medium text-foreground">{WEEKDAYS[busiest.day]} {String(busiest.hour).padStart(2, '0')}:00–{String((busiest.hour + 1) % 24).padStart(2, '0')}:00</span> with {fmtCount(busiest.n)} orders.</> : 'No orders in this period.'}
            >
              <div className={cn("overflow-hidden transition-opacity", updating && "opacity-60")}>
                <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px]">
                  <span />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <span key={h} className="text-center text-[9px] text-muted-foreground sm:text-[10px]">{h % 3 === 0 ? h : ''}</span>
                  ))}
                  {heat.map((row, d) => (
                    <Fragment key={d}>
                      <span className="pr-1 text-right text-[10px] leading-5 text-muted-foreground">{WEEKDAYS[d]}</span>
                      {row.map((n, h) => (
                        <span
                          key={h}
                          className="h-5 rounded-[3px] bg-muted"
                          style={n > 0 ? { background: palette.s1, opacity: 0.12 + 0.88 * (n / heatMax) } : undefined}
                          title={`${WEEKDAYS[d]} ${String(h).padStart(2, '0')}:00 — ${n} orders`}
                          aria-label={`${WEEKDAYS[d]} ${h}:00, ${n} orders`}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                  Fewer
                  {[0.12, 0.34, 0.56, 0.78, 1].map((o) => <span key={o} className="h-2.5 w-4 rounded-[2px]" style={{ background: palette.s1, opacity: o }} />)}
                  More
                </div>
              </div>
            </Panel>

            <Panel className="xl:col-span-4" icon={UserPlus} title="New clients" description="Clients added per day / month">
              <ChartBox height="h-48" dim={updating}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} minTickGap={24} />
                    <YAxis {...axisProps} width={32} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox title={label} rows={[{ key: 'c', label: 'New clients', value: fmtCount(Number(payload[0].value || 0)), color: palette.s1 }]} />
                      ) : null}
                    />
                    <Bar dataKey="newClients" fill={palette.s1} maxBarSize={24} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
              <p className="mt-2 text-xs text-muted-foreground">
                {fmtCount(clientStats.newInPeriod)} in this period · {fmtCount(clientStats.newInPrevPeriod)} in the previous one
              </p>
            </Panel>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { icon: ShoppingCart, value: fmtCount(kpi.trades), label: 'Trades' },
              { icon: DollarSign, value: kpi.salesCount > 0 ? formatCurrency(kpi.revenue / kpi.salesCount) : '—', label: 'Avg sale ticket' },
              { icon: Target, value: fmtCount(leadStats.open), label: 'Open Leads' },
              { icon: Clock, value: fmtCount(onboardingStats.pending), label: 'Pending Approvals' },
              { icon: Briefcase, value: fmtCount(kpi.employees), label: 'Employees' },
              { icon: Building, value: fmtCount(departmentData.length), label: 'Departments' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-[var(--shadow-xs)]">
                <span className="rounded-md bg-muted p-2 text-muted-foreground"><s.icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold leading-tight text-foreground">{s.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Clients & KYC Tab */}
        <TabsContent value="clients" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile label="New Clients" value={fmtCount(clientStats.newInPeriod)} sub="This period" icon={UserPlus} />
            <KpiTile label="KYC Verified" value={fmtCount(kycStats.verified)} tone="positive" sub={`In selected period (${fmtCount(kycStats.verifiedAllTime)} all-time)`} icon={CheckCircle} />
            <KpiTile label="KYC Pending" value={fmtCount(kycStats.pending)} tone="warning" sub="In selected period" icon={AlertCircle} />
            <KpiTile label="KYC Rejected" value={fmtCount(kycStats.rejected)} tone="negative" sub="In selected period" icon={XCircle} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel icon={UserCheck} title="KYC status of new clients" description="Clients added in the selected period">
              {kycTotal === 0 ? (
                <EmptyState icon={UserCheck} title="No new clients in this period" className="py-8" />
              ) : (
                <>
                  <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label="KYC status split">
                    {[
                      { k: 'v', n: kycStats.verified, c: 'bg-success' },
                      { k: 'p', n: kycStats.pending, c: 'bg-warning' },
                      { k: 'r', n: kycStats.rejected, c: 'bg-destructive' },
                    ].filter((x) => x.n > 0).map((x) => <div key={x.k} className={x.c} style={{ width: `${(x.n / kycTotal) * 100}%` }} />)}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: 'Verified', n: kycStats.verified, tone: 'success' as const, icon: CheckCircle },
                      { label: 'Pending', n: kycStats.pending, tone: 'warning' as const, icon: AlertCircle },
                      { label: 'Rejected', n: kycStats.rejected, tone: 'danger' as const, icon: XCircle },
                    ].map((x) => (
                      <div key={x.label} className="rounded-md border border-border/70 p-3">
                        <StatusChip tone={x.tone}><x.icon className="h-3 w-3" />{x.label}</StatusChip>
                        <p className="mt-2 font-display text-xl font-bold text-foreground">{fmtCount(x.n)}</p>
                        <p className="text-xs text-muted-foreground">{Math.round((x.n / kycTotal) * 100)}% of new clients</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-md bg-muted/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Verification Rate</span>
                      <span className="font-display text-lg font-bold text-success">{kycStats.verificationRate}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-success/15">
                      <div className="h-2 rounded-full bg-success" style={{ width: `${kycStats.verificationRate}%` }} />
                    </div>
                  </div>
                </>
              )}
            </Panel>

            <Panel icon={Users} title="Client Type Breakdown" description="Buyers and sellers added in the selected period">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'New Buyers', n: clientStats.buyers },
                  { label: 'New Sellers', n: clientStats.sellers },
                ].map((x) => (
                  <div key={x.label} className="rounded-md border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">{x.label}</p>
                    <p className="mt-1 font-display text-2xl font-bold text-foreground">{fmtCount(x.n)}</p>
                    <ShareBar className="mt-2" value={x.n} max={Math.max(clientStats.buyers, clientStats.sellers, 1)} />
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">All clients on record</span><span className="font-mono text-[13px] tabular-nums">{fmtCount(clientStats.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">KYC verified, all time</span><span className="font-mono text-[13px] tabular-nums">{fmtCount(kycStats.verifiedAllTime)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Added in previous period</span><span className="font-mono text-[13px] tabular-nums">{fmtCount(clientStats.newInPrevPeriod)}</span></div>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel icon={Clock} title="Onboarding approvals" description="Approval requests raised in the selected period">
              {onboardingTotal === 0 ? (
                <EmptyState icon={Clock} title="No approval requests in this period" className="py-8" />
              ) : (
                <>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Approved', n: onboardingStats.approved, tone: 'positive' as const },
                      { label: 'Pending', n: onboardingStats.pending, tone: 'warning' as const },
                      { label: 'Rejected', n: onboardingStats.rejected, tone: 'negative' as const },
                    ].map((x) => (
                      <div key={x.label} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                        <span className="text-muted-foreground">{x.label}</span>
                        <ShareBar value={x.n} max={onboardingTotal} tone={x.tone} />
                        <span className="text-right font-mono text-[13px] tabular-nums">{fmtCount(x.n)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 border-t border-border/70 pt-3 text-sm text-muted-foreground">
                    Approved order value <span className="font-mono font-semibold text-foreground">{formatCurrency(onboardingStats.totalValue)}</span>
                  </p>
                </>
              )}
            </Panel>

            <Panel icon={MapPin} title="Revenue by client state" description="Sales value by the state recorded on the order">
              {stateRevenue.length === 0 ? (
                <EmptyState icon={MapPin} title="No client states recorded in this period" className="py-8" />
              ) : (
                <div className="space-y-2">
                  {stateRevenue.slice(0, 8).map((s) => (
                    <div key={s.state} className="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 text-sm">
                      <span className="truncate text-foreground">{s.state}</span>
                      <ShareBar value={s.revenue} max={stateMax} />
                      <span className="text-right font-mono text-[13px] tabular-nums">{formatCurrency(s.revenue)}</span>
                    </div>
                  ))}
                  <p className="pt-2 text-xs text-muted-foreground">
                    {stateRevenue.length > 8 ? `${stateRevenue.length - 8} more states · ` : ''}
                    {kpi.revenue > 0 ? `${Math.round((noStateRevenue / kpi.revenue) * 100)}% of revenue has no state recorded` : ''}
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile label="New Leads" value={fmtCount(leadStats.newInPeriod)} icon={Target} />
            <KpiTile label="Open Leads" value={fmtCount(leadStats.open)} icon={Clock} />
            <KpiTile label="Converted" value={fmtCount(leadStats.converted)} tone="positive" icon={CheckCircle} />
            <KpiTile label="Lost" value={fmtCount(leadStats.lost)} tone="negative" icon={XCircle} />
            <KpiTile label="Conversion Rate" value={`${leadStats.conversionRate.toFixed(1)}%`} icon={TrendingUp} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel icon={Phone} title="Lead Sources Performance" description={`${fmtCount(leadStats.total)} leads on record in total`}>
              {leadStats.leadSourceData.length > 0 ? (
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Converted</TableHead>
                      <TableHead className="w-[30%]">Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadStats.leadSourceData.slice(0, 6).map((source) => (
                      <TableRow key={source.name}>
                        <TableCell className="font-medium">{source.name}</TableCell>
                        <TableCell className="text-right font-mono text-[13px] tabular-nums">{source.leads}</TableCell>
                        <TableCell className="text-right font-mono text-[13px] tabular-nums text-success">{source.converted}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ShareBar value={source.rate} max={100} tone="positive" />
                            <span className="w-9 shrink-0 text-right font-mono text-[12px] tabular-nums">{source.rate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={Phone} title="No lead data available" className="py-8" />
              )}
            </Panel>

            <Panel
              icon={TrendingUp}
              title="Lead Conversion Trend"
              actions={<div className="flex gap-3"><LegendKey color={palette.s2} label="New leads" /><LegendKey color={palette.positive} label="Converted" /></div>}
            >
              <ChartBox dim={updating}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} minTickGap={20} />
                    <YAxis {...axisProps} width={32} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox
                          title={label}
                          rows={[
                            { key: 'n', label: 'New leads', value: fmtCount(Number(payload.find((p: any) => p.dataKey === 'newLeads')?.value || 0)), color: palette.s2 },
                            { key: 'c', label: 'Converted', value: fmtCount(Number(payload.find((p: any) => p.dataKey === 'convertedLeads')?.value || 0)), color: palette.positive },
                          ]}
                        />
                      ) : null}
                    />
                    <Bar dataKey="newLeads" fill={palette.s2} maxBarSize={18} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="convertedLeads" fill={palette.positive} maxBarSize={18} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </Panel>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="mt-0 space-y-4">
          <Panel
            icon={Award}
            title="Desk performance"
            description="Orders each staff member entered in the period (sales and purchases). Owners are left out, as in all staff statistics."
            footer={employeePerformance.length > 0 ? (
              <>Clients added by assigned operator: {employeePerformance.map((e) => `${e.name} ${e.clientsAdded}`).join(' · ')}</>
            ) : undefined}
          >
            {deskPerformance.length === 0 ? (
              <EmptyState icon={Briefcase} title="No orders in this period" description="Once orders are entered, the staff who handled them appear here." />
            ) : (
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Sell orders</TableHead>
                    <TableHead className="text-right">Buy orders</TableHead>
                    <TableHead className="text-right">Volume handled</TableHead>
                    <TableHead className="hidden w-[22%] md:table-cell">Share of volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deskPerformance.map((d, i) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">{i + 1}</span>
                        {d.name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] tabular-nums">{fmtCount(d.sell)}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] tabular-nums">{fmtCount(d.buy)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-semibold tabular-nums">{formatCurrency(d.volume)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <ShareBar value={d.volume} max={deskMax} />
                          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{deskTotal > 0 ? `${Math.round((d.volume / deskTotal) * 100)}%` : '—'}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          <Panel
            icon={Users}
            title="Top Clients by Volume"
            description={topClients.length > 0 && kpi.revenue > 0
              ? `Top ${topClients.length} of ${fmtCount(clientCount)} clients = ${Math.round((top10Volume / kpi.revenue) * 100)}% of sales volume`
              : 'Sales volume per client in the period'}
          >
            {topClients.length > 0 ? (
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 whitespace-nowrap">Rank</TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="hidden w-[22%] md:table-cell">Share of revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClients.map((client, index) => (
                    <TableRow key={client.key}>
                      <TableCell>
                        <span className={cn("inline-flex h-6 min-w-[1.75rem] items-center justify-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-semibold", index < 3 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>#{index + 1}</span>
                      </TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] tabular-nums">{client.trades}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-semibold tabular-nums">{formatCurrency(client.volume)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <ShareBar value={client.volume} max={topClients[0]?.volume || 1} />
                          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{kpi.revenue > 0 ? `${((client.volume / kpi.revenue) * 100).toFixed(1)}%` : '—'}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState icon={Users} title="No client data available for this period" className="py-8" />
            )}
          </Panel>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile label="Total Revenue" value={formatCurrency(kpi.revenue)} exact={formatExactINR(kpi.revenue)} />
            <KpiTile label="Operating Expenses" value={formatCurrency(totalExpenses)} exact={formatExactINR(totalExpenses)} tone="negative" />
            <KpiTile
              label="Net Profit"
              value={formatSigned(kpi.profit)}
              exact={formatExactINR(kpi.profit)}
              tone={kpi.profit >= 0 ? 'positive' : 'negative'}
              info="Gross profit from the daily snapshots − operating expenses − USDT fees (valued at the period's average purchase rate)."
              sub={`Gross ${formatCurrency(kpi.grossProfit)} − expenses ${formatCurrency(totalExpenses)} − fees ${formatCurrency(kpi.usdtFeesInr)}`}
            />
            <KpiTile label="Monthly Salary" value={formatCurrency(totalSalary)} exact={formatExactINR(totalSalary)} sub="Active CTC / 12" />
            <KpiTile
              label="Total USDT Fees Collected"
              value={formatUSDT(usdtFees.total)}
              sub="Click to view complete history"
              icon={Coins}
              onClick={() => setShowFeeHistoryDialog(true)}
              cta="Fee history"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel
              icon={Receipt}
              title="Expense Breakdown"
              description={`${formatCurrency(totalExpenses)} by head · open a head and click a category for its transactions`}
            >
              {expenseHeads.length > 0 ? (
                <div className={cn(updating && "pointer-events-none opacity-60")} aria-busy={updating}>
                  {headList(expenseHeads, expenseHeadMax, totalExpenses, "negative", setSelectedExpenseCategory, 'e')}
                </div>
              ) : (
                <EmptyState icon={Receipt} title="No expenses in selected period" className="py-8" />
              )}
            </Panel>

            <Panel
              icon={FileBarChart}
              title="Income Breakdown"
              description={`Total ${formatCurrency(totalIncome)} (excludes settlements)`}
            >
              {incomeHeads.length > 0 ? (
                <div className={cn(updating && "pointer-events-none opacity-60")} aria-busy={updating}>
                  {headList(incomeHeads, incomeHeadMax, totalIncome, "positive", setSelectedIncomeCategory, 'i')}
                </div>
              ) : (
                <EmptyState icon={FileBarChart} title="No income in selected period" className="py-8" />
              )}
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      {/* USDT Fees History Dialog */}
      <Dialog open={showFeeHistoryDialog} onOpenChange={setShowFeeHistoryDialog}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              USDT Fees History
            </DialogTitle>
          </DialogHeader>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Fees', value: formatUSDT(usdtFees.total) },
              { label: 'Order Fees (Sales + Purchase)', value: formatUSDT(usdtFees.platform) },
              { label: 'Transfer Fees', value: formatUSDT(usdtFees.transfer) },
              { label: 'Sales vs Purchase', value: `${formatUSDT(usdtFees.salesOrder)} / ${formatUSDT(usdtFees.purchaseOrder)}` },
            ].map((c) => (
              <div key={c.label} className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Transactions Table */}
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="text-right">Fee (USDT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usdtFees.transactions.length > 0 ? (
                feePager.slice.map((fee: any) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="whitespace-nowrap text-sm">{format(new Date(fee.created_at), 'MMM dd, yyyy')}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(fee.created_at), 'HH:mm:ss')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone="neutral">
                        {fee.reference_type === 'PLATFORM_FEE' ? 'Platform' :
                         fee.reference_type === 'TRANSFER_FEE' ? 'Transfer' :
                         fee.reference_type === 'SALES_ORDER_FEE' ? 'Sales Order' :
                         fee.reference_type === 'PURCHASE_ORDER_FEE' ? 'Purchase Order' :
                         fee.reference_type}
                      </StatusChip>
                    </TableCell>
                    <TableCell className="text-sm">
                      {fee.wallets?.wallet_name || 'N/A'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {fee.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-[13px] font-medium tabular-nums">
                      {formatUSDT(Number(fee.amount || 0))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Coins className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No fee transactions found in selected period</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePager {...feePager} noun="fee transactions" />
        </DialogContent>
      </Dialog>

      {/* Expense Category Drill-Down Dialog */}
      <ExpenseCategoryDrillDown
        category={selectedExpenseCategory}
        onClose={() => setSelectedExpenseCategory(null)}
        startDate={getDateRange().startDate}
        endDate={getDateRange().endDate}
        formatCurrency={formatCurrency}
      />

      {/* Income Category Drill-Down Dialog */}
      <IncomeCategoryDrillDown
        category={selectedIncomeCategory}
        onClose={() => setSelectedIncomeCategory(null)}
        startDate={getDateRange().startDate}
        endDate={getDateRange().endDate}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}
