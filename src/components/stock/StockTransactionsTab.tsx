
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
import { useAssetCodes } from "@/hooks/useAssetCodes";
import { Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ClickableUser } from "@/components/ui/clickable-user";
import { getCurrentUserId, logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { fetchActiveWalletsWithLedgerAssetBalance, fetchWalletLedgerAssetBalance } from "@/lib/wallet-ledger-balance";
import { PermissionGate } from "@/components/PermissionGate";
import { ReversalBadge } from "./ReversalBadge";
import { useTerminalUserPrefs } from "@/hooks/useTerminalUserPrefs";
import { Switch } from "@/components/ui/switch";
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
    transferFee: "",
    assetCode: "USDT"
  });
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Per-user "Hide reversal noise" preference (default OFF for full audit view)
  const _userIdForPrefs = getCurrentUserId();
  const [stockPrefs, setStockPref] = useTerminalUserPrefs<{ hideReversals: boolean }>(
    _userIdForPrefs,
    "stock_transactions_tab",
    { hideReversals: false }
  );
  const hideReversalNoise = stockPrefs.hideReversals;

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
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets(wallet_name)
        `)
        .in('reference_type', ['MANUAL_TRANSFER', 'MANUAL_ADJUSTMENT', 'SALES_ORDER', 'PURCHASE_ORDER', 'TRANSFER_FEE', 'ERP_CONVERSION', 'WALLET_TRANSFER', 'SALES_ORDER_FEE'])
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

      const conversionIds = Array.from(
        new Set(tx.filter((t: any) => t.reference_type === 'ERP_CONVERSION' && t.reference_id).map((t: any) => t.reference_id))
      ) as string[];

      const [{ data: salesOrders }, { data: purchaseOrders }, { data: purchaseItems }, { data: conversions }, { data: productsData }] = await Promise.all([
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
        conversionIds.length
          ? supabase
              .from('erp_product_conversions')
              .select('id, reference_no, asset_code, side, price_usd, created_by')
              .in('id', conversionIds)
          : Promise.resolve({ data: [] } as any),
        supabase
          .from('products')
          .select('code, average_buying_price'),
      ]);

      const soById = new Map<string, any>();
      (salesOrders || []).forEach((so: any) => so?.id && soById.set(so.id, so));

      const poById = new Map<string, any>();
      (purchaseOrders || []).forEach((po: any) => po?.id && poById.set(po.id, po));

      const convById = new Map<string, any>();
      (conversions || []).forEach((c: any) => c?.id && convById.set(c.id, c));

      const avgBuyPriceByCode = new Map<string, number>();
      (productsData || []).forEach((p: any) => p?.code && avgBuyPriceByCode.set(p.code, Number(p.average_buying_price || 0)));

      const avgPurchasePriceByPo = new Map<string, number>();
      (purchaseItems || []).forEach((pi: any) => {
        const poId = pi?.purchase_order_id;
        if (!poId) return;
        const qty = parseFloat(String(pi.quantity)) || 0;
        const total = parseFloat(String(pi.total_price)) || 0;
        const current = avgPurchasePriceByPo.get(poId) || 0;
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
          ...(conversions || []).map((c: any) => c.created_by).filter(Boolean),
          ...(tx || []).map((t: any) => t.created_by).filter(Boolean),
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
        // IMMUTABLE-LEDGER PRINCIPLE:
        // Prefer values stamped on the wallet_transactions row itself
        // (effective_usdt_rate, effective_usdt_qty, market_rate_usdt) over anything
        // re-derived from sales_orders / purchase_orders, which can be edited.
        // This guarantees the displayed "Total" against any past row is the value
        // that was true at fulfilment time and never shifts retroactively.
        const stampedRate = t.effective_usdt_rate != null ? Number(t.effective_usdt_rate) : null;
        const stampedQty  = t.effective_usdt_qty  != null ? Number(t.effective_usdt_qty)  : null;
        const stampedTotal = stampedRate != null && stampedQty != null ? stampedRate * stampedQty : null;

        if (t.reference_type === 'SALES_ORDER' && t.reference_id) {
          const so = soById.get(t.reference_id);
          const qty = parseFloat(String(t.amount)) || 0;
          // Fallback only when ledger row pre-dates the stamping system
          const fallbackUnit = so?.price_per_unit || 0;
          return {
            ...t,
            _unit_price: stampedRate ?? fallbackUnit,
            _total_amount: stampedTotal ?? qty * fallbackUnit,
            _value_is_stamped: stampedTotal != null,
            _supplier_customer_name: so?.client_name || null,
            _reference_number: so?.order_number || null,
            _created_by_user: so?.created_by ? userById.get(so.created_by) : null,
          };
        }

        if (t.reference_type === 'PURCHASE_ORDER' && t.reference_id) {
          const po = poById.get(t.reference_id);
          const total = avgPurchasePriceByPo.get(t.reference_id) || 0;
          const qtyTotal = qtyByPo.get(t.reference_id) || 0;
          const fallbackUnit = qtyTotal > 0 ? total / qtyTotal : 0;
          const qty = parseFloat(String(t.amount)) || 0;
          return {
            ...t,
            _unit_price: stampedRate ?? fallbackUnit,
            _total_amount: stampedTotal ?? qty * fallbackUnit,
            _value_is_stamped: stampedTotal != null,
            _supplier_customer_name: po?.supplier_name || null,
            _reference_number: po?.order_number || null,
            _created_by_user: po?.created_by ? userById.get(po.created_by) : null,
          };
        }

        if (t.reference_type === 'ERP_CONVERSION' && t.reference_id) {
          const conv = convById.get(t.reference_id);
          const qty = parseFloat(String(t.amount)) || 0;
          const fallbackUnit = conv?.price_usd || 0;
          return {
            ...t,
            _unit_price: stampedRate ?? fallbackUnit,
            _total_amount: stampedTotal ?? qty * fallbackUnit,
            _value_is_stamped: stampedTotal != null,
            _supplier_customer_name: `${conv?.side || ''} ${conv?.asset_code || t.asset_code || ''}`.trim(),
            _reference_number: conv?.reference_no || null,
            _created_by_user: conv?.created_by ? userById.get(conv.created_by) : null,
          };
        }

        // Manual transfer / adjustment / wallet transfer: no source order, prefer stamped rate.
        const qty = parseFloat(String(t.amount)) || 0;
        const fallbackUnit = avgBuyPriceByCode.get(t.asset_code) || 0;
        return {
          ...t,
          _unit_price: stampedRate ?? fallbackUnit,
          _total_amount: stampedTotal ?? qty * fallbackUnit,
          _value_is_stamped: stampedTotal != null,
          _supplier_customer_name: null,
          _reference_number: null,
          _created_by_user: t.created_by ? userById.get(t.created_by) : null,
        };
      });

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

  // Fetch wallets with live asset-specific balances for manual adjustments
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_asset_balance', adjustmentData.assetCode],
    queryFn: async () => {
      return fetchActiveWalletsWithLedgerAssetBalance(
        adjustmentData.assetCode,
        'id, wallet_name, wallet_type, chain_name, current_balance, fee_percentage, is_fee_enabled'
      );
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const { data: assetCodes } = useAssetCodes();

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
        // Validate balance before proceeding using ledger balance for selected asset
        const totalDeduction = amount + transferFee;
        const sourceWalletName = wallets?.find((wallet) => wallet.id === adjustmentData.fromWallet)?.wallet_name || 'source wallet';
        const sourceWalletBalance = await fetchWalletLedgerAssetBalance(adjustmentData.fromWallet, adjustmentData.assetCode);

        if (sourceWalletBalance < totalDeduction) {
          throw new Error(
            `Insufficient balance in ${sourceWalletName}. Required: ${totalDeduction.toFixed(4)} ${adjustmentData.assetCode}, Available: ${sourceWalletBalance.toFixed(4)} ${adjustmentData.assetCode}`
          );
        }
        
        // Create debit transaction for source wallet
        const { error: debitError } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: 'TRANSFER_OUT',
            amount: amount,
            asset_code: adjustmentData.assetCode,
            reference_type: 'MANUAL_TRANSFER',
            reference_id: transferRefId,
            description: `Transfer to another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} ${adjustmentData.assetCode})` : ''}: ${adjustmentData.description}`,
            balance_before: 0,
            balance_after: 0,
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
            asset_code: adjustmentData.assetCode,
            reference_type: 'MANUAL_TRANSFER',
            reference_id: transferRefId,
            description: `Transfer from another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} ${adjustmentData.assetCode} deducted from sender)` : ''}: ${adjustmentData.description}`,
            balance_before: 0,
            balance_after: 0,
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
              asset_code: adjustmentData.assetCode,
              reference_type: 'TRANSFER_FEE',
              reference_id: transferRefId,
              description: `Transfer fee for wallet-to-wallet transfer: ${adjustmentData.description}`,
              balance_before: 0,
              balance_after: 0,
              created_by: createdByUserId
            });
          
          if (feeError) throw feeError;
        }
      } else {
        // Single wallet adjustment (CREDIT or DEBIT)
        const { error } = await supabase
          .from('wallet_transactions')
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: adjustmentData.transactionType,
            amount: amount,
            asset_code: adjustmentData.assetCode,
            reference_type: 'MANUAL_ADJUSTMENT',
            reference_id: null,
            description: adjustmentData.description,
            balance_before: 0,
            balance_after: 0,
            created_by: createdByUserId
          });

        if (error) throw error;
      }

      // Stock syncing is handled by database triggers automatically
      
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
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances_summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowAdjustmentDialog(false);
      setAdjustmentData({
        fromWallet: "",
        toWallet: "",
        amount: "",
        description: "",
        transactionType: "TRANSFER",
        transferFee: "",
        assetCode: "USDT"
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

  // Reverse wallet transaction (immutable ledger — posts an opposite-sign row)
  const deleteTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const reversedBy = isValidUuid ? rawUserId : null;

      const { data, error } = await supabase.rpc('reverse_wallet_transaction', {
        p_tx_id: transactionId,
        p_reason: reason,
        p_reversed_by: reversedBy,
      });

      if (error) throw error;
      return data as string; // new reversal row id
    },
    onSuccess: () => {
      toast({
        title: "Transaction Reversed",
        description: "An opposite-sign reversal entry was posted. The original record is preserved.",
      });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      refetch();
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
      setReversalReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Reversal failed",
        description: error?.message || "Failed to post reversal",
        variant: "destructive",
      });
    }
  });

  // Reversible only for manual entries (purchase/sales/etc. must be reversed via their own modules)
  const isDeletableEntry = (entry: any) => {
    if (entry.type !== 'wallet') return false;
    if (entry.reference_type === 'REVERSAL') return false; // never reverse a reversal
    if (entry.is_reversed) return false; // already reversed
    return ['MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE'].includes(entry.reference_type);
  };

  const handleDeleteTransaction = (entry: any) => {
    setTransactionToDelete(entry);
    setReversalReason("");
    setShowDeleteConfirm(true);
  };

  const confirmDeleteTransaction = () => {
    if (transactionToDelete && reversalReason.trim().length >= 3) {
      deleteTransactionMutation.mutate({
        transactionId: transactionToDelete.id,
        reason: reversalReason.trim(),
      });
    }
  };

  const getTransactionBadge = (type: string, refType?: string) => {
    if (refType === 'ERP_CONVERSION') {
      return <Badge className="bg-indigo-100 text-indigo-800">Conversion</Badge>;
    }
    if (refType === 'WALLET_TRANSFER') {
      if (type === 'CREDIT') return <Badge className="bg-purple-100 text-purple-800">Transfer In</Badge>;
      if (type === 'DEBIT') return <Badge className="bg-orange-100 text-orange-800">Transfer Out</Badge>;
    }
    if (refType === 'TRANSFER_FEE') {
      return <Badge className="bg-amber-100 text-amber-800">Transfer Fee</Badge>;
    }
    if (refType === 'SALES_ORDER_FEE') {
      return <Badge className="bg-amber-100 text-amber-800">Platform Fee</Badge>;
    }
    switch (type) {
      case 'IN':
        return <Badge className="bg-green-100 text-green-800">Stock In</Badge>;
      case 'OUT':
        return <Badge className="bg-red-100 text-red-800">Stock Out</Badge>;
      case 'PURCHASE':
        return <Badge className="bg-blue-100 text-blue-800">Purchase</Badge>;
      case 'Sales':
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
          products: {
              name: w.asset_code || 'USDT',
              code: w.asset_code || 'USDT',
              unit_of_measurement: 'Units',
            },
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
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((entry: any) =>
      hideReversalNoise
        ? !(entry.type === 'wallet' && (entry.is_reversed || entry.reverses_transaction_id))
        : true
    );

  // Collect unique wallet names and product codes for filter dropdowns
  const uniqueWallets = Array.from(new Set(allEntries.map(e => e.wallet_name).filter(Boolean))).sort();
  const uniqueProducts = Array.from(new Set([
    "USDT", "BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "SHIB", "TON", "USDC", "FDUSD",
    ...(assetCodes || []),
    ...allEntries.map(e => e.products?.code).filter(Boolean)
  ])).sort();


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stock Transactions</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="stk-hide-rev-noise" className="text-xs text-muted-foreground cursor-pointer">
                  Hide reversal noise
                </Label>
                <Switch
                  id="stk-hide-rev-noise"
                  checked={hideReversalNoise}
                  onCheckedChange={(v) => setStockPref("hideReversals", !!v)}
                />
              </div>
              <Button
                onClick={() => setShowAdjustmentDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Manual Adjustment
              </Button>
            </div>
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
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Quantity</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">USDT Rate</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Eff. USDT Qty</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Wallet</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Supplier/Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Reference</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Created By</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Closing Bal.</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
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
                        <div className="flex items-center">
                          {getTransactionBadge(entry.transaction_type, entry.reference_type)}
                          {entry.type === 'wallet' && (
                            <ReversalBadge
                              isReversed={(entry as any).is_reversed}
                              reversesTransactionId={(entry as any).reverses_transaction_id}
                              description={(entry as any).description}
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const assetCode = entry.products?.code || entry.closing_asset || 'USDT';
                          const isStable = ['USDT', 'USDC', 'FDUSD'].includes(assetCode);
                          const maxDecimals = isStable ? 4 : 8;
                          return `${parseFloat(entry.quantity.toString()).toLocaleString('en-IN', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: maxDecimals
                          })} ${entry.products?.unit_of_measurement}`;
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-sm">
                        {entry.market_rate_usdt ? parseFloat(entry.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-sm">
                        {entry.effective_usdt_qty ? parseFloat(entry.effective_usdt_qty).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '-'}
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
                              {(() => {
                                const assetCode = entry.closing_asset || entry.products?.code || 'USDT';
                                const isStable = ['USDT', 'USDC', 'FDUSD'].includes(assetCode);
                                const maxDecimals = isStable ? 4 : 8;
                                return parseFloat(entry.closing_balance.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });
                              })()}
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
                          <PermissionGate permissions={["stock_destructive"]} showFallback={false}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteTransaction(entry)}
                              disabled={deleteTransactionMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
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
              <Label>Asset Type *</Label>
              <Select 
                value={adjustmentData.assetCode} 
                onValueChange={(value) => setAdjustmentData(prev => ({ ...prev, assetCode: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {(assetCodes || ['USDT']).map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
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
                       {wallet.wallet_name} - {Number(wallet.current_balance || 0).toFixed(4)} {adjustmentData.assetCode}
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
                        {wallet.wallet_name} - {Number(wallet.current_balance || 0).toFixed(4)} {adjustmentData.assetCode}
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
                  step="any"
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
                  <span>{parseFloat(adjustmentData.amount || '0').toFixed(4)} {adjustmentData.assetCode}</span>
                </div>
                {parseFloat(adjustmentData.transferFee || '0') > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Fee (deducted from sender):</span>
                    <span>{parseFloat(adjustmentData.transferFee || '0').toFixed(4)} {adjustmentData.assetCode}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-2 mt-2">
                  <span>Total Deducted from Sender:</span>
                  <span>{(parseFloat(adjustmentData.amount || '0') + parseFloat(adjustmentData.transferFee || '0')).toFixed(4)} {adjustmentData.assetCode}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Receiver Gets:</span>
                  <span>{parseFloat(adjustmentData.amount || '0').toFixed(4)} {adjustmentData.assetCode}</span>
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

      {/* Reverse Transaction Confirmation Dialog (Immutable Ledger) */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Transaction</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  The original entry will be preserved forever. A new opposite-sign
                  reversal row of{' '}
                  <strong>
                    {(transactionToDelete?.amount ?? transactionToDelete?.quantity ?? 0)
                      .toLocaleString('en-IN')}{' '}
                    {transactionToDelete?.asset_code || 'USDT'}
                  </strong>{' '}
                  will be posted and linked back to it.
                </p>
                <p className="text-muted-foreground">
                  Provide a clear reason — it is recorded in the immutable audit chain.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reversal-reason">Reason (required, min 3 chars)</Label>
            <Textarea
              id="reversal-reason"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Operator entered wrong amount; correcting via reversal."
              rows={3}
              disabled={deleteTransactionMutation.isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTransactionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTransaction}
              disabled={deleteTransactionMutation.isPending || reversalReason.trim().length < 3}
            >
              {deleteTransactionMutation.isPending ? "Posting reversal…" : "Post Reversal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
