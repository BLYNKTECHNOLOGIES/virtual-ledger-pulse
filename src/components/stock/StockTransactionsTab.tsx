
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

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['stock_transactions', searchTerm, filterType],
    queryFn: async () => {
      let query = supabase
        .from('stock_transactions')
        .select(`
          *,
          products(name, code, unit_of_measurement)
        `)
        .order('transaction_date', { ascending: false });

      if (searchTerm) {
        query = query.or(`supplier_customer_name.ilike.%${searchTerm}%,reference_number.ilike.%${searchTerm}%`);
      }

      if (filterType !== "all") {
        query = query.eq('transaction_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Also fetch purchase order items to show purchase entries
  const { data: purchaseEntries } = useQuery({
    queryKey: ['purchase_stock_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders(order_number, supplier_name, order_date),
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
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets(wallet_name, wallet_type)
        `)
        .in('reference_type', ['MANUAL_TRANSFER', 'MANUAL_ADJUSTMENT'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
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

      // Sync USDT stock with wallet balances after transaction
      console.log('🔄 StockTransactions: Syncing USDT stock after manual adjustment...');
      const { error: syncError } = await supabase.rpc('sync_usdt_stock');
      if (syncError) {
        console.error('❌ StockTransactions: USDT sync failed:', syncError);
        throw syncError;
      }
      console.log('✅ StockTransactions: USDT stock synced successfully');
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
      date: t.transaction_date,
      supplier_name: t.supplier_customer_name,
      transaction_type: t.transaction_type,
      products: t.products
    })),
    // Purchase entries
    ...(purchaseEntries || []).map(p => ({
      ...p,
      type: 'purchase',
      transaction_type: 'PURCHASE',
      date: p.purchase_orders?.order_date,
      supplier_name: p.purchase_orders?.supplier_name,
      reference_number: p.purchase_orders?.order_number,
      total_amount: p.total_price,
      products: p.products
    })),
    // Wallet transactions (convert to stock transaction format)
    ...(walletTransactions || []).map(w => ({
      ...w,
      type: 'wallet',
      date: w.created_at,
      supplier_name: w.wallets?.wallet_name || 'Wallet Transfer',
      reference_number: `WT-${w.id.slice(0, 8)}`,
      quantity: w.amount,
      unit_price: w.transaction_type?.includes('TRANSFER') ? null : 1, // Nil for transfers, ₹1 for manual adjustments
      total_amount: w.amount,
      products: usdtProduct ? {
        name: usdtProduct.name,
        code: usdtProduct.code,
        unit_of_measurement: usdtProduct.unit_of_measurement
      } : { name: 'USDT', code: 'USDT', unit_of_measurement: 'Pieces' }
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier/Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {allEntries?.map((entry, index) => (
                    <tr key={`${entry.type}-${entry.id}-${index}`} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{format(new Date(entry.date), 'dd/MM/yyyy')}</td>
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
                      <td className="py-3 px-4">{entry.unit_price ? `₹${entry.unit_price}` : 'Nil'}</td>
                      <td className="py-3 px-4">₹{entry.total_amount || 0}</td>
                      <td className="py-3 px-4">{entry.supplier_name || '-'}</td>
                      <td className="py-3 px-4">{entry.reference_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {allEntries?.length === 0 && (
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
