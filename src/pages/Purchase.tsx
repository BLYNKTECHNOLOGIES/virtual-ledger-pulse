import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Download, ShoppingBag, Filter, Search, Link2, Package } from "lucide-react";
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
import { Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";


export default function Purchase() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'completed';
  });
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();

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

  // Fetch all purchase orders for export
  const { data: allPurchaseOrders } = useQuery({
    queryKey: ['purchase_orders_export'],
    queryFn: async () => {
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
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  const handleExportCSV = async () => {
    if (!allPurchaseOrders || allPurchaseOrders.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no purchase orders to export.",
        variant: "destructive"
      });
      return;
    }

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

      // Determine platform label from source
      // For manual entries, use the actual wallet/platform where USDT was received/deducted
      const walletPlatform = (order as any).wallet?.wallet_name?.trim();
      const platformLabel = order.source === 'terminal' ? 'Binance P2P' 
        : order.source === 'terminal_small_buys' ? 'Binance P2P (Small Buys)'
        : order.source === 'manual' ? (walletPlatform || 'Manual') : (order.source || '');

      // Use splits first, fall back to bank_transactions
      const splits = splitsByOrder[order.id];
      const bankTxns = bankTxnsByOrderNo[order.order_number || ''];
      const paymentSources = (splits && splits.length > 0) ? splits : (bankTxns || []);
      const hasSplits = paymentSources.length > 1;

      const buildBaseRow = (bankName: string, accountName: string, paidAmount: string, isSplit: string) => [
        order.order_number || '',
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

      if (hasSplits) {
        paymentSources.forEach(src => {
          csvData.push(buildBaseRow(src.bank_name, src.account_name, String(src.amount), 'Yes'));
        });
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
  };

  const clearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchTerm("");
    setShowFilterDialog(false);
  };

  return (
    <PermissionGate
      permissions={["purchase_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Purchase Management.
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
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="bg-white rounded-xl mb-4 md:mb-6 shadow-sm border border-gray-100">
        <div className="px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-3 bg-violet-50 rounded-xl shadow-sm">
                <ShoppingBag className="h-6 w-6 md:h-8 md:w-8 text-violet-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">
                  Purchase Order Management
                </h1>
                <p className="text-slate-600 text-sm md:text-lg truncate">
                  Manage purchases and orders
                </p>
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:justify-end">
              <Button variant="outline" onClick={handleExportCSV} size="sm" className="flex-shrink-0 whitespace-nowrap">
                <Download className="h-4 w-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              <PermissionGate permissions={["purchase_manage"]} showFallback={false}>
                <ManualPurchaseEntryDialog onSuccess={handleRefreshData} />
              </PermissionGate>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <Card className="mb-4">
        <CardContent className="p-3 md:p-4">
          <div className="flex gap-2 md:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 hidden md:block" />
                <Input 
                  placeholder="Search orders..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
              <Button variant="outline" onClick={() => setShowFilterDialog(true)} size="sm">
                <Filter className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Filter</span>
              </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Filter Purchase Orders</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date From</Label>
                      <Input 
                        type="date" 
                        value={filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setFilterDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                    <div>
                      <Label>Date To</Label>
                      <Input 
                        type="date" 
                        value={filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setFilterDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={clearFilters}>Clear</Button>
                    <Button onClick={() => setShowFilterDialog(false)}>Apply</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders Tabs */}
        <Card className="w-full">
        <CardContent className="p-3 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 md:mb-6 h-auto">
              <TabsTrigger value="completed" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <span className="truncate">Completed</span>
                {ordersSummary?.completed ? (
                  <Badge variant="default" className="text-xs">{ordersSummary.completed}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="terminal_sync" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <Link2 className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Terminal Sync</span>
                {terminalSyncCount > 0 ? (
                  <Badge variant="default" className="text-xs">{terminalSyncCount}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="small_buys" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2 px-1 md:px-3 text-xs md:text-sm">
                <Package className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Small Buys</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="completed">
              <CompletedPurchaseOrders 
                searchTerm={searchTerm}
                dateFrom={filterDateFrom}
                dateTo={filterDateTo}
              />
            </TabsContent>

            <TabsContent value="terminal_sync">
              <TerminalSyncTab />
            </TabsContent>

            <TabsContent value="small_buys">
              <SmallBuysSyncTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
    </PermissionGate>
  );
}
