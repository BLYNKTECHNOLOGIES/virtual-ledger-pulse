import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, CheckCircle2, Link2, Package, Shield } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterChip } from "@/components/ui/filter-chip";
import { format } from "date-fns";
import { TerminalSyncTab } from "@/components/purchase/TerminalSyncTab";
import { SmallBuysSyncTab } from "@/components/purchase/SmallBuysSyncTab";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompletedPurchaseOrders } from "@/components/purchase/CompletedPurchaseOrders";
import { ManualPurchaseEntryDialog } from "@/components/purchase/ManualPurchaseEntryDialog";
import { PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_ASSET_CODES } from "@/hooks/useAssetCodes";
import { useDeepLinkHighlight } from "@/components/transaction-detail";
import { DateRangeFilter, PanelToolbar, SUBNAV_LIST, SUBNAV_TRIGGER, SearchField, TabCount, fmtDate } from "@/components/orders-ui";

/** The purchase date filter has always held the picked day at UTC midnight (new Date("yyyy-MM-dd")). */
const toUtcDay = (d: Date | undefined) => (d ? new Date(format(d, "yyyy-MM-dd")) : undefined);

export default function Purchase() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'completed';
  });
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();
  const [filterAssetType, setFilterAssetType] = useState<string>("");
  useDeepLinkHighlight(['orderId']);


  const handleRefreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_export'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['wallets'] });
    queryClient.invalidateQueries({ queryKey: ['wallets-with-details'] });
    queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
    queryClient.invalidateQueries({ queryKey: ['tds-records'] });
  };

  // Fetch terminal sync pending count (today only, matching TerminalSyncTab filter)
  const { data: terminalSyncCount = 0 } = useQuery({
    queryKey: ['terminal-sync-pending-count'],
    queryFn: async () => {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const nowUTC = Date.now();
      const midnightISTinUTC = Math.floor((nowUTC + IST_OFFSET_MS) / 86400000) * 86400000 - IST_OFFSET_MS;

      const [{ data, error }, { data: sbData }] = await Promise.all([
        supabase
          .from('terminal_purchase_sync')
          .select('id, order_data, sync_status')
          .in('sync_status', ['synced_pending_approval', 'client_mapping_pending']),
        supabase
          .from('small_buys_config' as any)
          .select('is_enabled, min_amount, max_amount')
          .limit(1)
          .maybeSingle(),
      ]);

      if (error) throw error;

      const sbConfig = sbData as any;
      const sbEnabled = sbConfig?.is_enabled === true;
      const sbMin = sbEnabled ? Number(sbConfig.min_amount || 0) : 0;
      const sbMax = sbEnabled ? Number(sbConfig.max_amount || 0) : 0;

      return (data || []).filter(record => {
        const od = record.order_data as any;
        const createTime = od?.create_time ? Number(od.create_time) : 0;
        if (createTime < midnightISTinUTC) return false;

        if (sbEnabled && sbMax > 0) {
          const totalPrice = parseFloat(od?.total_price || '0');
          if (totalPrice >= sbMin && totalPrice <= sbMax) {
            return false;
          }
        }

        return true;
      }).length;
    },
  });

  // Fetch purchase orders summary for badges
  const { data: ordersSummary } = useQuery({
    queryKey: ['purchase_orders_summary'],
    queryFn: async () => {
      const [completedRes] = await Promise.all([
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
      ]);
      
      return {
        completed: completedRes.count || 0,
      };
    },
  });

  // Fetch all purchase orders for export (paginated to bypass Supabase 1000-row default cap)
  const fetchAllPurchaseOrders = async () => {
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            products (
              code
            )
          ),
          wallet:wallets!wallet_id(wallet_name),
          created_by_user:users!created_by(username, first_name, last_name),
          terminal_sync:terminal_purchase_sync!terminal_sync_id(binance_order_number)
        `)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const { data: assetOptions = DEFAULT_ASSET_CODES } = useQuery({
    queryKey: ['purchase_asset_filter_options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('product_category, product_name, purchase_order_items(products(code))')
        .limit(5000);
      if (error) throw error;
      const codes = new Set(DEFAULT_ASSET_CODES);
      (data || []).forEach((order: any) => {
        const itemCode = order.purchase_order_items?.[0]?.products?.code;
        [itemCode, order.product_category, order.product_name].forEach((value) => {
          const code = String(value || '').trim().toUpperCase();
          if (code) codes.add(code);
        });
      });
      return Array.from(codes).sort();
    },
    staleTime: 300000,
  });

  const handleExportCSV = async () => {
    if (isExporting) return;
    setIsExporting(true);
    let allPurchaseOrders: any[] = [];
    try {
      toast({ title: "Preparing export", description: "Fetching purchase orders…" });
      allPurchaseOrders = await fetchAllPurchaseOrders();
    } catch (e: any) {
      setIsExporting(false);
      toast({
        title: "Export failed",
        description: e?.message || "Could not fetch purchase orders.",
        variant: "destructive",
      });
      return;
    }

    if (allPurchaseOrders.length === 0) {
      setIsExporting(false);
      toast({
        title: "No data to export",
        description: "There are no purchase orders to export.",
        variant: "destructive"
      });
      return;
    }

    try {


    // Fetch all payment splits with bank details (batch in chunks to avoid URL limits)
    const orderIds = allPurchaseOrders.map(o => o.id);
    const orderNumbers = allPurchaseOrders.map(o => o.order_number).filter(Boolean);
    
    let allSplits: any[] = [];
    const CHUNK = 200;
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const chunk = orderIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('purchase_order_payment_splits')
        .select('purchase_order_id, amount, bank_account_id, bank_accounts:bank_account_id(account_name, bank_name)')
        .in('purchase_order_id', chunk);
      if (data) allSplits = allSplits.concat(data);
    }

    // Fetch bank transactions as fallback for orders without splits
    let allBankTxns: any[] = [];
    for (let i = 0; i < orderNumbers.length; i += CHUNK) {
      const chunk = orderNumbers.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('bank_transactions')
        .select('reference_number, amount, bank_account_id, bank_accounts:bank_account_id(account_name, bank_name)')
        .in('reference_number', chunk);
      if (data) allBankTxns = allBankTxns.concat(data);
    }

    // Group splits by order id
    const splitsByOrder: Record<string, Array<{ amount: number; bank_name: string; account_name: string }>> = {};
    (allSplits || []).forEach((s: any) => {
      const oid = s.purchase_order_id;
      if (!splitsByOrder[oid]) splitsByOrder[oid] = [];
      splitsByOrder[oid].push({
        amount: Number(s.amount) || 0,
        bank_name: s.bank_accounts?.bank_name || '',
        account_name: s.bank_accounts?.account_name || '',
      });
    });

    // Group bank transactions by order number as fallback
    const bankTxnsByOrderNo: Record<string, Array<{ amount: number; bank_name: string; account_name: string }>> = {};
    (allBankTxns || []).forEach((t: any) => {
      const ref = t.reference_number;
      if (!bankTxnsByOrderNo[ref]) bankTxnsByOrderNo[ref] = [];
      bankTxnsByOrderNo[ref].push({
        amount: Number(t.amount) || 0,
        bank_name: t.bank_accounts?.bank_name || '',
        account_name: t.bank_accounts?.account_name || '',
      });
    });

    const csvHeaders = [
      'Order Number',
      'Binance Order Number',
      'Supplier Name',
      'Contact Number',
      'State',
      'Platform',
      'Asset/Product Type',
      'Product Name',
      'Product Category',
      'Quantity',
      'Price Per Unit',
      'Effective Price Per Unit (USDT)',
      'Total Amount',
      'TDS Applied',
      'TDS Amount',
      'PAN Number',
      'Net Payable Amount',
      'Tax Amount',
      'Fee Percentage',
      'Fee Amount',
      'Net Amount',
      'Status',
      'Is Off Market',
      'Is Safe Fund',
      'Total Paid',
      'Payment Method Type',
      'UPI ID',
      'Bank Name',
      'Bank Account Name',
      'Bank Account Number',
      'IFSC Code',
      'Split Payment',
      'Split Bank Name',
      'Split Bank Account',
      'Split Amount',
      'Warehouse Name',
      'Assigned To',
      'Description',
      'Notes',
      'Created By',
      'Order Date',
      'Created At'
    ];

    const csvData: any[][] = [];

    allPurchaseOrders.forEach(order => {
      const pricePerUnit = Number(order.price_per_unit) || 0;
      const marketRate = Number(order.market_rate_usdt) || 0;
      const productCategory = (order.product_category || '').toUpperCase();
      const itemProductCode = order.purchase_order_items?.[0]?.products?.code?.toUpperCase() || '';
      
      const assetType = itemProductCode || productCategory || (order.product_name || 'USDT').toUpperCase();
      
      const quantity = Number(order.quantity) || 0;
      const totalAmountInr = Number(order.total_amount) || 0;
      const storedEffectiveRate = Number(order.effective_usdt_rate || 0);
      const storedEffectiveQty = Number(order.effective_usdt_qty || 0);
      const hasStoredEffectiveRate = order.effective_usdt_rate !== null && order.effective_usdt_rate !== undefined;
      const isLegacyBrokenEffectiveRate =
        hasStoredEffectiveRate &&
        storedEffectiveRate === 1 &&
        pricePerUnit > 1 &&
        quantity > 0 &&
        Math.abs(storedEffectiveQty - totalAmountInr) < 0.000001 &&
        Math.abs(marketRate - pricePerUnit) < 0.000001;

      let effectivePriceUsdt = hasStoredEffectiveRate && !isLegacyBrokenEffectiveRate
        ? storedEffectiveRate
        : pricePerUnit;

      if ((!hasStoredEffectiveRate || isLegacyBrokenEffectiveRate) && assetType !== 'USDT' && marketRate > 0 && quantity > 0) {
        const usdtEquivQty = quantity * marketRate;
        effectivePriceUsdt = usdtEquivQty > 0 ? totalAmountInr / usdtEquivQty : pricePerUnit;
      }

      // Always use the actual wallet name as the platform — no synthetic labels.
      const walletPlatform = (order as any).wallet?.wallet_name?.trim();
      const platformLabel = walletPlatform || '';

      // Use splits first, fall back to bank_transactions
      const splits = splitsByOrder[order.id];
      const bankTxns = bankTxnsByOrderNo[order.order_number || ''];
      const paymentSources = (splits && splits.length > 0) ? splits : (bankTxns || []);
      const hasSplits = paymentSources.length > 1;

      const binanceOrderNumber = (order as any).terminal_sync?.binance_order_number || '';

      const buildBaseRow = (bankName: string, accountName: string, paidAmount: string, isSplit: string) => [
        order.order_number || '',
        binanceOrderNumber,
        order.supplier_name || '',
        order.contact_number || '',
        order.client_state || '',
        platformLabel,
        assetType,
        order.product_name || '',
        order.product_category || '',
        order.quantity || 0,
        pricePerUnit,
        effectivePriceUsdt.toFixed(6),
        order.total_amount || 0,
        order.tds_applied ? 'Yes' : 'No',
        order.tds_amount || 0,
        order.pan_number || '',
        order.net_payable_amount || order.total_amount || 0,
        order.tax_amount || 0,
        order.fee_percentage || 0,
        order.fee_amount || 0,
        order.net_amount || order.total_amount || 0,
        order.status || '',
        order.is_off_market ? 'Yes' : 'No',
        order.is_safe_fund ? 'Yes' : 'No',
        order.total_paid || 0,
        order.payment_method_type || '',
        order.upi_id || '',
        bankName,
        accountName,
        order.bank_account_number || '',
        order.ifsc_code || '',
        isSplit,
        bankName,
        accountName,
        paidAmount,
        order.warehouse_name || '',
        order.assigned_to || '',
        order.description || '',
        order.notes || '',
        order.created_by_user 
          ? (order.created_by_user.first_name || order.created_by_user.username || '')
          : '',
        order.order_date ? format(new Date(order.order_date), 'MMM dd, yyyy') : '',
        order.created_at ? format(new Date(order.created_at), 'MMM dd, yyyy HH:mm') : ''
      ];

      // Always emit exactly ONE row per order. For split payments, consolidate
      // every payment source into pipe-separated values within the same row
      // instead of duplicating the entire order row per split.
      if (hasSplits) {
        const bankNames = paymentSources.map(s => s.bank_name || '').join(' | ');
        const accountNames = paymentSources.map(s => s.account_name || '').join(' | ');
        const amounts = paymentSources.map(s => String(s.amount)).join(' | ');
        csvData.push(buildBaseRow(bankNames, accountNames, amounts, 'Yes'));
      } else {
        const single = paymentSources[0];
        csvData.push(buildBaseRow(
          single?.bank_name || '',
          single?.account_name || '',
          single ? String(single.amount) : '',
          'No'
        ));
      }
    });

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase_orders_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `Exported ${allPurchaseOrders.length} purchase orders.`
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Could not build the CSV.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // The search box updates the list 300 ms after typing stops (one search per pause, not per keystroke).
  useEffect(() => {
    if (searchInput === searchTerm) return;
    const t = window.setTimeout(() => setSearchTerm(searchInput), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const clearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterAssetType("");
    setSearchTerm("");
    setSearchInput("");
    setShowFilterDialog(false);
  };

  const filtersOn = Boolean(searchTerm.trim() || filterDateFrom || filterDateTo || filterAssetType);

  const toolbar = (
    <>
      <PanelToolbar>
        <SearchField
          value={searchInput}
          onValueChange={setSearchInput}
          label="Search purchase orders"
          placeholder="Order no., supplier, phone, description"
          data-page-search
          containerClassName="sm:min-w-[240px] sm:flex-1"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={filterAssetType || "all"} onValueChange={(value) => setFilterAssetType(value === "all" ? "" : value)}>
            <SelectTrigger className="h-9 sm:w-[140px]" aria-label="Filter by asset">
              <SelectValue placeholder="All assets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assets</SelectItem>
              {assetOptions.map((asset) => (
                <SelectItem key={asset} value={asset}>{asset}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            from={filterDateFrom}
            to={filterDateTo}
            onFromChange={(d) => setFilterDateFrom(toUtcDay(d))}
            onToChange={(d) => setFilterDateTo(toUtcDay(d))}
            className="sm:w-[210px]"
          />
        </div>
      </PanelToolbar>
      {filtersOn && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 sm:px-5">
          {searchTerm.trim() && (
            <FilterChip label="Search:" value={searchTerm} onRemove={() => { setSearchTerm(""); setSearchInput(""); }} />
          )}
          {filterAssetType && <FilterChip label="Asset:" value={filterAssetType} onRemove={() => setFilterAssetType("")} />}
          {filterDateFrom && <FilterChip label="From:" value={fmtDate(filterDateFrom)} onRemove={() => setFilterDateFrom(undefined)} />}
          {filterDateTo && <FilterChip label="To:" value={fmtDate(filterDateTo)} onRemove={() => setFilterDateTo(undefined)} />}
          <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}
    </>
  );

  return (
    <PermissionGate
      permissions={["purchase_view"]}
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center p-6 page-mount">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">Access Denied</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You don't have permission to access Purchase Management.
            </p>
            <Button className="mt-4" onClick={() => navigate("/dashboard")}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      }
    >
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:space-y-5 sm:p-6">
      <PageHeader
        title="Purchase orders"
        description="ERP purchase orders, Terminal purchases waiting for approval, and clubbed small buys."
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Button variant="outline" onClick={handleExportCSV} disabled={isExporting} size="sm" className="h-9 gap-1.5" aria-label="Export purchase orders as CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{isExporting ? 'Exporting…' : 'Export CSV'}</span>
            </Button>
            <PermissionGate permissions={["purchase_manage"]} showFallback={false}>
              <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
            </PermissionGate>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={SUBNAV_LIST}>
          <TabsTrigger value="completed" className={SUBNAV_TRIGGER}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
            {ordersSummary?.completed ? <TabCount value={ordersSummary.completed} /> : null}
          </TabsTrigger>
          <TabsTrigger value="terminal_sync" className={SUBNAV_TRIGGER}>
            <Link2 className="h-3.5 w-3.5" />
            Terminal sync
            {terminalSyncCount > 0 ? <TabCount value={terminalSyncCount} attention /> : null}
          </TabsTrigger>
          <TabsTrigger value="small_buys" className={SUBNAV_TRIGGER}>
            <Package className="h-3.5 w-3.5" />
            Small buys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="completed" className="mt-0">
          <CompletedPurchaseOrders
            searchTerm={searchTerm}
            dateFrom={filterDateFrom}
            dateTo={filterDateTo}
            assetType={filterAssetType}
            toolbar={toolbar}
            totalCount={ordersSummary?.completed}
            onClearFilters={clearFilters}
          />
        </TabsContent>

        <TabsContent value="terminal_sync" className="mt-0">
          <TerminalSyncTab />
        </TabsContent>

        <TabsContent value="small_buys" className="mt-0">
          <SmallBuysSyncTab />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  );
}
