
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
import { Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ClickableUser } from "@/components/ui/clickable-user";
import { getCurrentUserId, logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function StockTransactionsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterWallet, setFilterWallet] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjustmentData, setAdjustmentData] = useState({
    fromWallet: "",
    toWallet: "",
    amount: "",
    description: "",
    transactionType: "TRANSFER",
    transferFee: ""
  });
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
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
          wallets(wallet_name)
        `)
        .in('reference_type', ['MANUAL_TRANSFER', 'MANUAL_ADJUSTMENT', 'SALES_ORDER', 'PURCHASE_ORDER', 'TRANSFER_FEE'])
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
      const transferFee = parseFloat(adjustmentData.transferFee) || 0;
      // Get current user ID for attribution - validate UUID format
      const rawUserId = getCurrentUserId();
      // Only use if it's a valid UUID (wallet_transactions.created_by references users.id which is UUID)
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const createdByUserId = isValidUuid ? rawUserId : null;
      
      // Generate unique reference ID for idempotency
      const transferRefId = globalThis.crypto?.randomUUID?.() ?? null;
      
      if (adjustmentData.transactionType === 'TRANSFER') {
        // Validate balance before proceeding
        const totalDeduction = amount + transferFee;
        const { data: sourceWallet } = await supabase
          .from('wallets')
          .select('current_balance, wallet_name')
          .eq('id', adjustmentData.fromWallet)
          .single();
        
        if (!sourceWallet || sourceWallet.current_balance < totalDeduction) {
          throw new Error(`Insufficient balance in ${sourceWallet?.wallet_name || 'source wallet'}. Required: ${totalDeduction.toFixed(4)} USDT, Available: ${(sourceWallet?.current_balance || 0).toFixed(4)} USDT`);
        }
        
        // Create debit transaction for source wallet
        const { error: debitError } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: 'TRANSFER_OUT',
            amount: amount,
            reference_type: 'MANUAL_TRANSFER',
            reference_id: transferRefId,
            description: `Transfer to another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} USDT)` : ''}: ${adjustmentData.description}`,
            balance_before: 0, // Auto-set by DB trigger set_wallet_transaction_balances
            balance_after: 0,  // Auto-set by DB trigger set_wallet_transaction_balances
            created_by: createdByUserId
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
            reference_id: transferRefId,
            description: `Transfer from another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} USDT deducted from sender)` : ''}: ${adjustmentData.description}`,
            balance_before: 0, // Auto-set by DB trigger set_wallet_transaction_balances
            balance_after: 0,  // Auto-set by DB trigger set_wallet_transaction_balances
            created_by: createdByUserId
          });

        if (creditError) throw creditError;
        
        // Create fee transaction if fee is specified
        if (transferFee > 0) {
          const { error: feeError } = await supabase
            .from('wallet_transactions')
            .insert({
              wallet_id: adjustmentData.fromWallet,
              transaction_type: 'DEBIT',
              amount: transferFee,
              reference_type: 'TRANSFER_FEE',
              reference_id: transferRefId,
              description: `Transfer fee for wallet-to-wallet transfer: ${adjustmentData.description}`,
              balance_before: 0, // Auto-set by DB trigger
              balance_after: 0,  // Auto-set by DB trigger
              created_by: createdByUserId
            });
          
          if (feeError) throw feeError;
          console.log(`✅ Transfer fee of ${transferFee.toFixed(4)} USDT recorded`);
        }
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
            balance_before: 0, // Auto-set by DB trigger set_wallet_transaction_balances
            balance_after: 0,  // Auto-set by DB trigger set_wallet_transaction_balances
            created_by: createdByUserId
          });

        if (error) throw error;
      }

      // Stock syncing is handled by database triggers automatically
      console.log('✅ StockTransactions: Manual adjustment completed - stock updates handled by database triggers');
      
      // Return adjustment data for logging
      return { adjustmentData };
    },
    onSuccess: (_, variables) => {
      // Log the action for audit trail
      logActionWithCurrentUser({
        actionType: ActionTypes.STOCK_WALLET_ADJUSTED,
        entityType: EntityTypes.WALLET,
        entityId: variables.fromWallet,
        module: Modules.STOCK,
        metadata: { 
          adjustment_type: variables.transactionType, 
          amount: variables.amount, 
          description: variables.description,
          to_wallet: variables.toWallet || null,
          transfer_fee: variables.transferFee || null
        }
      });
      
      toast({
        title: "Success",
        description: "Manual stock adjustment completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowAdjustmentDialog(false);
      setAdjustmentData({
        fromWallet: "",
        toWallet: "",
        amount: "",
        description: "",
        transactionType: "TRANSFER",
        transferFee: ""
      });
    },
    onError: (error: any) => {
      console.error('❌ Manual adjustment failed:', error);
      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        (typeof error === 'string' ? error : null) ||
        'Failed to complete manual adjustment';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Delete wallet transaction mutation (with reversal)
  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const deletedBy = isValidUuid ? rawUserId : null;

      const { data, error } = await supabase.rpc('delete_wallet_transaction_with_reversal', {
        p_transaction_id: transactionId,
        p_deleted_by: deletedBy
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string; reversed_amount?: number } | null;
      if (!result?.success) throw new Error(result?.error || 'Failed to delete transaction');
      
      return result;
    },
    onSuccess: (result) => {
      toast({ 
        title: "Transaction Deleted", 
        description: `Transaction deleted and wallet balance reversed by ${Math.abs(result?.reversed_amount || 0).toLocaleString()} USDT` 
      });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      refetch();
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete transaction", 
        variant: "destructive" 
      });
    }
  });

  // Check if transaction is deletable (only manual adjustments/transfers from wallet entries)
  const isDeletableEntry = (entry: any) => {
    if (entry.type !== 'wallet') return false;
    return ['MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE'].includes(entry.reference_type);
  };

  const handleDeleteTransaction = (entry: any) => {
    setTransactionToDelete(entry);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteTransaction = () => {
    if (transactionToDelete) {
      deleteTransactionMutation.mutate(transactionToDelete.id);
    }
  };

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
      case 'TRANSFER_FEE':
        return <Badge className="bg-amber-100 text-amber-800">Transfer Fee</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  // Build closing balance maps from wallet transactions for order-linked entries
  const closingBalanceByOrderRef = new Map<string, { balance_after: number; wallet_name: string; asset_code: string }>();
  (walletTransactions || [])
    .filter((w: any) => ['SALES_ORDER', 'PURCHASE_ORDER'].includes(w.reference_type))
    .forEach((w: any) => {
      // Map by reference_id (order ID) or order_number
      const refNumber = (w as any)._reference_number;
      if (refNumber) {
        closingBalanceByOrderRef.set(refNumber, {
          balance_after: w.balance_after ?? 0,
          wallet_name: w.wallets?.wallet_name || '',
          asset_code: w.asset_code || 'USDT',
        });
      }
      if (w.reference_id) {
        closingBalanceByOrderRef.set(w.reference_id, {
          balance_after: w.balance_after ?? 0,
          wallet_name: w.wallets?.wallet_name || '',
          asset_code: w.asset_code || 'USDT',
        });
      }
    });

  // Combine all transactions
  const allEntries = [
    // Regular stock transactions
    ...(transactions || []).map(t => {
      const closingInfo = closingBalanceByOrderRef.get(t.reference_number) || closingBalanceByOrderRef.get((t as any).id);
      return {
        ...t,
        type: 'transaction',
        date: t.created_at,
        supplier_name: t.supplier_customer_name,
        transaction_type: t.transaction_type,
        products: t.products,
        wallet_name: (t as any).wallet_name || null,
        created_by_user: (t as any).created_by_user,
        closing_balance: closingInfo?.balance_after ?? null,
        closing_wallet: closingInfo?.wallet_name ?? null,
        closing_asset: closingInfo?.asset_code ?? null,
      };
    }),
    // Purchase entries
    ...(purchaseEntries || []).map(p => {
      const unitPrice = parseFloat(String(p.unit_price)) || 0;
      const qty = parseFloat(String(p.quantity)) || 0;
      const totalAmount = qty * unitPrice;
      const poId = (p as any).purchase_order_id || (p as any).purchase_orders?.id;
      const closingInfo = closingBalanceByOrderRef.get(p.purchase_orders?.order_number) || closingBalanceByOrderRef.get(poId);
      return {
        ...p,
        type: 'purchase',
        transaction_type: 'PURCHASE',
        date: p.created_at || p.purchase_orders?.order_date,
        supplier_name: p.purchase_orders?.supplier_name,
        reference_number: p.purchase_orders?.order_number,
        unit_price: unitPrice,
        total_amount: totalAmount,
        products: p.products,
        wallet_name: closingInfo?.wallet_name || null,
        created_by_user: (p.purchase_orders as any)?.created_by_user,
        closing_balance: closingInfo?.balance_after ?? null,
        closing_wallet: closingInfo?.wallet_name ?? null,
        closing_asset: closingInfo?.asset_code ?? null,
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
          closing_balance: w.balance_after ?? null,
          closing_wallet: w.wallets?.wallet_name || null,
          closing_asset: w.asset_code || 'USDT',
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
    .filter(entry => {
      // Wallet filter
      if (filterWallet !== "all") {
        return entry.wallet_name === filterWallet;
      }
      return true;
    })
    .filter(entry => {
      // Product filter
      if (filterProduct !== "all") {
        return entry.products?.code === filterProduct;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Collect unique wallet names and product codes for filter dropdowns
  const uniqueWallets = Array.from(new Set(allEntries.map(e => e.wallet_name).filter(Boolean))).sort();
  const uniqueProducts = Array.from(new Set(allEntries.map(e => e.products?.code).filter(Boolean))).sort();

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
              <SelectTrigger className="w-44">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="PURCHASE">Purchase</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterWallet} onValueChange={setFilterWallet}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Wallets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Wallets</SelectItem>
                {uniqueWallets.map(w => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Assets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {uniqueProducts.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
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
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Wallet</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier/Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Created By</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Closing Bal.</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
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
                      <td className="py-3 px-4 text-right">
                        {entry.closing_balance !== null && entry.closing_balance !== undefined ? (
                          <div>
                            <span className="font-medium text-sm tabular-nums">
                              {parseFloat(entry.closing_balance.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                            {entry.closing_wallet && (
                              <div className="text-[10px] text-muted-foreground">{entry.closing_wallet}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isDeletableEntry(entry) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteTransaction(entry)}
                            disabled={deleteTransactionMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
                       {wallet.wallet_name} - ₹{wallet.current_balance}
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
                        {wallet.wallet_name} - ₹{wallet.current_balance}
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

            {adjustmentData.transactionType === 'TRANSFER' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Transfer Fee (USDT)
                  <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="Enter fee amount (optional)"
                  value={adjustmentData.transferFee}
                  onChange={(e) => setAdjustmentData(prev => ({ ...prev, transferFee: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Enter reason for adjustment"
                value={adjustmentData.description}
                onChange={(e) => setAdjustmentData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Transfer Summary - Show when transfer type with fee */}
            {adjustmentData.transactionType === 'TRANSFER' && adjustmentData.fromWallet && adjustmentData.amount && (
              <div className="border rounded-lg p-3 bg-muted/50 space-y-2 text-sm">
                <div className="font-medium text-foreground">Transfer Summary</div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transfer Amount:</span>
                  <span>{parseFloat(adjustmentData.amount || '0').toFixed(4)} USDT</span>
                </div>
                {parseFloat(adjustmentData.transferFee || '0') > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Fee (deducted from sender):</span>
                    <span>{parseFloat(adjustmentData.transferFee || '0').toFixed(4)} USDT</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-2 mt-2">
                  <span>Total Deducted from Sender:</span>
                  <span>{(parseFloat(adjustmentData.amount || '0') + parseFloat(adjustmentData.transferFee || '0')).toFixed(4)} USDT</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Receiver Gets:</span>
                  <span>{parseFloat(adjustmentData.amount || '0').toFixed(4)} USDT</span>
                </div>
              </div>
            )}

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

      {/* Delete Transaction Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction & Reverse Balance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Delete the transaction record</li>
                <li>Reverse the wallet balance by <strong>{transactionToDelete?.amount?.toLocaleString() || transactionToDelete?.quantity?.toLocaleString()} USDT</strong></li>
                {transactionToDelete?.reference_type === 'MANUAL_TRANSFER' && (
                  <li>Delete all related transfer transactions (including fee if any)</li>
                )}
              </ul>
              <p className="mt-3 text-destructive font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTransactionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteTransaction}
              disabled={deleteTransactionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTransactionMutation.isPending ? "Deleting..." : "Delete & Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
