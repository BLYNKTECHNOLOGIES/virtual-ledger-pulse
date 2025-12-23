
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Filter, Plus, ArrowLeftRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ClickableUser } from "@/components/ui/clickable-user";

export function StockTransactionsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjustmentData, setAdjustmentData] = useState({
    fromWallet: "",
    toWallet: "",
    amount: "",
    description: "",
    transactionType: "TRANSFER"
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ['stock_transactions', searchTerm, filterType],
    queryFn: async () => {
      let query = supabase
        .from('stock_transactions')
        .select(`
          *,
          products(name, code, unit_of_measurement),
          created_by_user:users!created_by(id, username, first_name, last_name, email, phone, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`supplier_customer_name.ilike.%${searchTerm}%,reference_number.ilike.%${searchTerm}%`);
      }

      if (filterType !== "all") {
        query = query.eq('transaction_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;


      // stock_transactions doesn't store wallet_id/created_by reliably; infer via sales_orders.order_number (= reference_number)
      const refs = Array.from(
        new Set((data || []).map((t: any) => t.reference_number).filter(Boolean))
      ) as string[];

      if (refs.length === 0) return data;

      const { data: salesOrders, error: soError } = await supabase
        .from('sales_orders')
        .select(`order_number, wallet_id, created_by, price_per_unit, quantity`)
        .in('order_number', refs);

      if (soError) {
        console.warn('⚠️ StockTransactions: failed to load sales_orders for wallet/creator enrichment', soError);
        return data;
      }

      const walletIds = Array.from(
        new Set((salesOrders || []).map((so: any) => so.wallet_id).filter(Boolean))
      ) as string[];
      const creatorIds = Array.from(
        new Set((salesOrders || []).map((so: any) => so.created_by).filter(Boolean))
      ) as string[];

      const [{ data: walletsData, error: wError }, { data: usersData, error: uError }] = await Promise.all([
        walletIds.length
          ? supabase.from('wallets').select('id, wallet_name').in('id', walletIds)
          : Promise.resolve({ data: [], error: null } as any),
        creatorIds.length
          ? supabase
              .from('users')
              .select('id, username, first_name, last_name, email, phone, avatar_url')
              .in('id', creatorIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (wError) console.warn('⚠️ StockTransactions: failed to load wallets', wError);
      if (uError) console.warn('⚠️ StockTransactions: failed to load users', uError);

      const walletNameById = new Map<string, string>();
      (walletsData || []).forEach((w: any) => {
        if (w?.id) walletNameById.set(w.id, w.wallet_name);
      });

      const userById = new Map<string, any>();
      (usersData || []).forEach((u: any) => {
        if (u?.id) userById.set(u.id, u);
      });

      const soByOrder = new Map<string, any>();
      (salesOrders || []).forEach((so: any) => {
        if (so?.order_number) soByOrder.set(so.order_number, so);
      });

      return (data || []).map((t: any) => {
        const so = soByOrder.get(t.reference_number);
        const walletName = so?.wallet_id ? walletNameById.get(so.wallet_id) : null;
        const createdByUser = so?.created_by ? userById.get(so.created_by) : null;
        // Get unit_price from sales_order.price_per_unit, calculate total_amount = qty * unit_price
        const unitPrice = so?.price_per_unit || t.unit_price || 0;
        const qty = parseFloat(t.quantity) || 0;
        const totalAmount = qty * unitPrice;
        return {
          ...t,
          wallet_name: walletName || null,
          created_by_user: createdByUser || (t as any).created_by_user || null,
          unit_price: unitPrice,
          total_amount: totalAmount,
        };
      });
    },
    staleTime: 10000, // Refresh every 10 seconds
    gcTime: 30000, // Cache for 30 seconds
  });

  // Also fetch purchase order items to show purchase entries
  const { data: purchaseEntries } = useQuery({
    queryKey: ['purchase_stock_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders(
            order_number, 
            supplier_name, 
            order_date, 
            created_by,
            created_by_user:users!created_by(id, username, first_name, last_name, email, phone, avatar_url)
          ),
          products(name, code, unit_of_measurement)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch wallet transactions for stock movements
  const { data: walletTransactions } = useQuery({
    queryKey: ['wallet_stock_transactions'],
    queryFn: async () => {
      console.log('🔄 Fetching wallet transactions...');
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets(wallet_name, wallet_type)
        `)
        .in('reference_type', ['MANUAL_TRANSFER', 'MANUAL_ADJUSTMENT', 'SALES_ORDER', 'PURCHASE_ORDER'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Wallet transactions error:', error);
        throw error;
      }

      const tx = data || [];

      const salesOrderIds = Array.from(
        new Set(tx.filter((t: any) => t.reference_type === 'SALES_ORDER' && t.reference_id).map((t: any) => t.reference_id))
      ) as string[];

      const purchaseOrderIds = Array.from(
        new Set(tx.filter((t: any) => t.reference_type === 'PURCHASE_ORDER' && t.reference_id).map((t: any) => t.reference_id))
      ) as string[];

      const [{ data: salesOrders }, { data: purchaseOrders }, { data: purchaseItems }] = await Promise.all([
        salesOrderIds.length
          ? supabase
              .from('sales_orders')
              .select('id, order_number, client_name, price_per_unit, created_by')
              .in('id', salesOrderIds)
          : Promise.resolve({ data: [] } as any),
        purchaseOrderIds.length
          ? supabase
              .from('purchase_orders')
              .select('id, order_number, supplier_name, created_by')
              .in('id', purchaseOrderIds)
          : Promise.resolve({ data: [] } as any),
        purchaseOrderIds.length
          ? supabase
              .from('purchase_order_items')
              .select('purchase_order_id, quantity, unit_price, total_price')
              .in('purchase_order_id', purchaseOrderIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const soById = new Map<string, any>();
      (salesOrders || []).forEach((so: any) => so?.id && soById.set(so.id, so));

      const poById = new Map<string, any>();
      (purchaseOrders || []).forEach((po: any) => po?.id && poById.set(po.id, po));

      const avgPurchasePriceByPo = new Map<string, number>();
      (purchaseItems || []).forEach((pi: any) => {
        const poId = pi?.purchase_order_id;
        if (!poId) return;
        const qty = parseFloat(String(pi.quantity)) || 0;
        const total = parseFloat(String(pi.total_price)) || 0;
        const current = avgPurchasePriceByPo.get(poId) || 0;
        // temporarily store total in map (we'll compute avg using a second map)
        avgPurchasePriceByPo.set(poId, current + (qty > 0 ? total : 0));
      });

      // compute total qty per PO
      const qtyByPo = new Map<string, number>();
      (purchaseItems || []).forEach((pi: any) => {
        const poId = pi?.purchase_order_id;
        if (!poId) return;
        const qty = parseFloat(String(pi.quantity)) || 0;
        qtyByPo.set(poId, (qtyByPo.get(poId) || 0) + qty);
      });

      const creatorIds = Array.from(
        new Set([
          ...(salesOrders || []).map((so: any) => so.created_by).filter(Boolean),
          ...(purchaseOrders || []).map((po: any) => po.created_by).filter(Boolean),
        ])
      ) as string[];

      const { data: usersData } = creatorIds.length
        ? await supabase
            .from('users')
            .select('id, username, first_name, last_name, email, phone, avatar_url')
            .in('id', creatorIds)
        : ({ data: [] } as any);

      const userById = new Map<string, any>();
      (usersData || []).forEach((u: any) => u?.id && userById.set(u.id, u));

      const enriched = tx.map((t: any) => {
        if (t.reference_type === 'SALES_ORDER' && t.reference_id) {
          const so = soById.get(t.reference_id);
          const unitPrice = so?.price_per_unit || 0;
          const qty = parseFloat(String(t.amount)) || 0;
          return {
            ...t,
            _unit_price: unitPrice,
            _total_amount: qty * unitPrice,
            _supplier_customer_name: so?.client_name || null,
            _reference_number: so?.order_number || null,
            _created_by_user: so?.created_by ? userById.get(so.created_by) : null,
          };
        }

        if (t.reference_type === 'PURCHASE_ORDER' && t.reference_id) {
          const po = poById.get(t.reference_id);
          const total = avgPurchasePriceByPo.get(t.reference_id) || 0;
          const qtyTotal = qtyByPo.get(t.reference_id) || 0;
          const unitPrice = qtyTotal > 0 ? total / qtyTotal : 0;
          const qty = parseFloat(String(t.amount)) || 0;
          return {
            ...t,
            _unit_price: unitPrice,
            _total_amount: qty * unitPrice,
            _supplier_customer_name: po?.supplier_name || null,
            _reference_number: po?.order_number || null,
            _created_by_user: po?.created_by ? userById.get(po.created_by) : null,
          };
        }

        // Manual transfer / manual adjustment
        const qty = parseFloat(String(t.amount)) || 0;
        const unitPrice = 1;
        return {
          ...t,
          _unit_price: unitPrice,
          _total_amount: qty * unitPrice,
          _supplier_customer_name: null,
          _reference_number: null,
          _created_by_user: null,
        };
      });

      console.log('✅ Wallet transactions loaded:', enriched.length, 'transactions');
      return enriched;
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
  });

  // Get USDT product info for wallet transactions
  const { data: usdtProduct } = useQuery({
    queryKey: ['usdt_product'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('code', 'USDT')
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch wallets for transfer options
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data;
    },
  });

  // Manual stock adjustment mutation
  const manualAdjustmentMutation = useMutation({
    mutationFn: async (adjustmentData: any) => {
      const amount = parseFloat(adjustmentData.amount);
      
      if (adjustmentData.transactionType === 'TRANSFER') {
        // Create debit transaction for source wallet
        const { error: debitError } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: 'TRANSFER_OUT',
            amount: amount,
            reference_type: 'MANUAL_TRANSFER',
            reference_id: null,
            description: `Transfer to another wallet: ${adjustmentData.description}`,
            balance_before: 0, // Will be calculated by trigger
            balance_after: 0   // Will be calculated by trigger
          });

        if (debitError) throw debitError;

        // Create credit transaction for destination wallet
        const { error: creditError } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.toWallet,
            transaction_type: 'TRANSFER_IN',
            amount: amount,
            reference_type: 'MANUAL_TRANSFER',
            reference_id: null,
            description: `Transfer from another wallet: ${adjustmentData.description}`,
            balance_before: 0, // Will be calculated by trigger
            balance_after: 0   // Will be calculated by trigger
          });

        if (creditError) throw creditError;
      } else {
        // Single wallet adjustment (CREDIT or DEBIT)
        const { error } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: adjustmentData.transactionType,
            amount: amount,
            reference_type: 'MANUAL_ADJUSTMENT',
            reference_id: null,
            description: adjustmentData.description,
            balance_before: 0, // Will be calculated by trigger
            balance_after: 0   // Will be calculated by trigger
          });

        if (error) throw error;
      }

      // Stock syncing is handled by database triggers automatically
      console.log('✅ StockTransactions: Manual adjustment completed - stock updates handled by database triggers');
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Manual stock adjustment completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowAdjustmentDialog(false);
      setAdjustmentData({
        fromWallet: "",
        toWallet: "",
        amount: "",
        description: "",
        transactionType: "TRANSFER"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete manual adjustment",
        variant: "destructive",
      });
    },
  });

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return <Badge className="bg-green-100 text-green-800">Stock In</Badge>;
      case 'OUT':
        return <Badge className="bg-red-100 text-red-800">Stock Out</Badge>;
      case 'PURCHASE':
        return <Badge className="bg-blue-100 text-blue-800">Purchase</Badge>;
      case 'Sales':
        return <Badge className="bg-red-100 text-red-800">Sales</Badge>;
      case 'SALES_ORDER':
        return <Badge className="bg-red-100 text-red-800">Sales</Badge>;
      case 'TRANSFER_IN':
        return <Badge className="bg-purple-100 text-purple-800">Transfer In</Badge>;
      case 'TRANSFER_OUT':
        return <Badge className="bg-orange-100 text-orange-800">Transfer Out</Badge>;
      case 'CREDIT':
        return <Badge className="bg-green-100 text-green-800">Manual Credit</Badge>;
      case 'DEBIT':
        return <Badge className="bg-red-100 text-red-800">Manual Debit</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  // Combine all transactions
  const allEntries = [
    // Regular stock transactions
    ...(transactions || []).map(t => ({
      ...t,
      type: 'transaction',
      date: t.created_at, // Use created_at for accurate timestamp instead of transaction_date
      supplier_name: t.supplier_customer_name,
      transaction_type: t.transaction_type,
      products: t.products,
      wallet_name: (t as any).wallet_name || null,
      created_by_user: (t as any).created_by_user
    })),
    // Purchase entries
    ...(purchaseEntries || []).map(p => {
      const unitPrice = parseFloat(String(p.unit_price)) || 0;
      const qty = parseFloat(String(p.quantity)) || 0;
      const totalAmount = qty * unitPrice;
      return {
        ...p,
        type: 'purchase',
        transaction_type: 'PURCHASE',
        date: p.created_at || p.purchase_orders?.order_date, // Use created_at for actual entry time
        supplier_name: p.purchase_orders?.supplier_name,
        reference_number: p.purchase_orders?.order_number,
        unit_price: unitPrice,
        total_amount: totalAmount,
        products: p.products,
        wallet_name: 'BINANCE BLYNK', // Default wallet for purchases
        created_by_user: (p.purchase_orders as any)?.created_by_user
      };
    }),
    // Wallet transactions (manual transfers/adjustments only; orders are already represented above)
    ...(walletTransactions || [])
      .filter((w: any) => !['SALES_ORDER', 'PURCHASE_ORDER'].includes(w.reference_type))
      .map(w => {
        const qty = parseFloat(String(w.amount)) || 0;
        const unitPrice = (w as any)._unit_price ?? 0;
        const totalAmount = (w as any)._total_amount ?? qty * unitPrice;

        const referenceFromOrder = (w as any)._reference_number;
        const supplierFromOrder = (w as any)._supplier_customer_name;
        const createdByUser = (w as any)._created_by_user;

        return {
          ...w,
          type: 'wallet',
          date: w.created_at,
          supplier_name: supplierFromOrder || w.wallets?.wallet_name || 'BINANCE BLYNK',
          reference_number: referenceFromOrder || `WT-${w.id.slice(-8)}b`,
          quantity: qty,
          unit_price: unitPrice,
          total_amount: totalAmount,
          transaction_type: w.transaction_type,
          products: usdtProduct
            ? {
                name: usdtProduct.name,
                code: usdtProduct.code,
                unit_of_measurement: usdtProduct.unit_of_measurement,
              }
            : { name: 'USDT', code: 'USDT', unit_of_measurement: 'Units' },
          wallet_name: w.wallets?.wallet_name || 'BINANCE BLYNK',
          created_by_user: createdByUser || null,
        };
      })
  ];

  // Apply filters to combined entries
  const filteredEntries = allEntries
    .filter(entry => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          entry.supplier_name?.toLowerCase().includes(searchLower) ||
          entry.reference_number?.toLowerCase().includes(searchLower) ||
          entry.products?.name?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    })
    .filter(entry => {
      // Type filter
      if (filterType !== "all") {
        return entry.transaction_type === filterType;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  console.log('📈 Total combined entries:', allEntries.length);
  console.log('🔍 Filtered entries:', filteredEntries.length);
  console.log('💰 Wallet entries:', walletTransactions?.length || 0);
  console.log('📦 Stock entries:', transactions?.length || 0);
  console.log('🛒 Purchase entries:', purchaseEntries?.length || 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stock Transactions</CardTitle>
            <Button 
              onClick={() => setShowAdjustmentDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Manual Adjustment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by supplier or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="IN">Stock In</SelectItem>
                <SelectItem value="OUT">Stock Out</SelectItem>
                <SelectItem value="PURCHASE">Purchase Orders</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="SALES_ORDER">Sales Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading transactions...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Unit Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Total Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Wallet</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier/Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Created By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries?.map((entry, index) => (
                    <tr key={`${entry.type}-${entry.id}-${index}`} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{formatInTimeZone(new Date(entry.date), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss')}</td>
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{entry.products?.name}</div>
                          <div className="text-sm text-gray-500">{entry.products?.code}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getTransactionBadge(entry.transaction_type)}
                      </td>
                      <td className="py-3 px-4">
                        {parseFloat(entry.quantity.toString()).toLocaleString('en-IN', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 3
                        })} {entry.products?.unit_of_measurement}
                      </td>
                      <td className="py-3 px-4">{entry.unit_price ? `₹${Number(entry.unit_price).toFixed(2)}` : '₹0'}</td>
                      <td className="py-3 px-4">₹{Number(entry.total_amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4">
                        {entry.wallet_name ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {entry.wallet_name}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4">{entry.supplier_name || '-'}</td>
                      <td className="py-3 px-4">{entry.reference_number || '-'}</td>
                      <td className="py-3 px-4">
                        {entry.created_by_user ? (
                          <ClickableUser
                            userId={entry.created_by_user.id}
                            username={entry.created_by_user.username}
                            firstName={entry.created_by_user.first_name}
                            lastName={entry.created_by_user.last_name}
                            email={entry.created_by_user.email}
                            phone={entry.created_by_user.phone}
                            role={entry.created_by_user.role}
                            avatarUrl={entry.created_by_user.avatar_url}
                          />
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredEntries?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No stock transactions found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Stock Adjustment Dialog */}
      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manual Stock Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select 
                value={adjustmentData.transactionType} 
                onValueChange={(value) => setAdjustmentData(prev => ({ ...prev, transactionType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFER">Transfer Between Wallets</SelectItem>
                  <SelectItem value="CREDIT">Add Stock (Credit)</SelectItem>
                  <SelectItem value="DEBIT">Remove Stock (Debit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>From Wallet {adjustmentData.transactionType !== 'CREDIT' ? '*' : ''}</Label>
              <Select 
                value={adjustmentData.fromWallet} 
                onValueChange={(value) => setAdjustmentData(prev => ({ ...prev, fromWallet: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.wallet_type}) - ₹{wallet.current_balance}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {adjustmentData.transactionType === 'TRANSFER' && (
              <div className="space-y-2">
                <Label>To Wallet *</Label>
                <Select 
                  value={adjustmentData.toWallet} 
                  onValueChange={(value) => setAdjustmentData(prev => ({ ...prev, toWallet: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.filter(w => w.id !== adjustmentData.fromWallet).map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.wallet_name} ({wallet.wallet_type}) - ₹{wallet.current_balance}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={adjustmentData.amount}
                onChange={(e) => setAdjustmentData(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Enter reason for adjustment"
                value={adjustmentData.description}
                onChange={(e) => setAdjustmentData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setShowAdjustmentDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (!adjustmentData.fromWallet || !adjustmentData.amount || 
                      (adjustmentData.transactionType === 'TRANSFER' && !adjustmentData.toWallet)) {
                    toast({
                      title: "Validation Error",
                      description: "Please fill in all required fields",
                      variant: "destructive",
                    });
                    return;
                  }
                  manualAdjustmentMutation.mutate(adjustmentData);
                }}
                disabled={manualAdjustmentMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {manualAdjustmentMutation.isPending ? "Processing..." : "Submit Adjustment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
