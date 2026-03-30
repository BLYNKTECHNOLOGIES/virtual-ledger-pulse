import { useState, useMemo, useEffect } from "react";
import { parseApprovalError } from "@/utils/approvalErrorParser";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { fetchCoinMarketRate } from "@/hooks/useCoinMarketRate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, Plus, Minus, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { requireCurrentUserId } from "@/lib/system-action-logger";
import { createSellerClient, findAllClientsByName } from "@/utils/clientIdGenerator";
import { format } from "date-fns";
import { DataConflictBanner } from "@/components/terminal/DataConflictBanner";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncRecord: any;
  onSuccess: () => void;
}

interface PaymentSplit {
  bank_account_id: string;
  amount: string;
}

export function TerminalPurchaseApprovalDialog({ open, onOpenChange, syncRecord, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coinUsdtRate, setCoinUsdtRate] = useState<number | null>(null);
  const od = syncRecord?.order_data || {};
  const assetCode = (od.asset || 'USDT').toUpperCase();
  const isNonUsdt = assetCode !== 'USDT';
  const payMethodText = String(od.pay_method || '').toUpperCase();
  const isUpiPayment = payMethodText.includes('UPI');

  const [tdsOption, setTdsOption] = useState<'none' | '1%' | '20%'>('none');
  const [panNumber, setPanNumber] = useState(syncRecord?.pan_number || '');
  const [bankAccountId, setBankAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(
    od.create_time ? new Date(od.create_time).toISOString() : new Date().toISOString()
  );
  const [remarks, setRemarks] = useState('');
  // Seller bank details are now captured automatically by the server-side capture-beneficiaries edge function
  // No manual entry needed during approval
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');
  const [linkedClientName, setLinkedClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [duplicateClients, setDuplicateClients] = useState<any[]>([]);
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ bank_account_id: '', amount: '' }]);
  
  // Contact & State form fields (like Sales dialog)
  const [contactNumber, setContactNumber] = useState('');
  const [clientState, setClientState] = useState('');

  // Conflict tracking between client master and counterparty records
  const [clientMasterPan, setClientMasterPan] = useState('');
  const [counterpartyPan, setCounterpartyPan] = useState('');
  const [clientMasterPhone, setClientMasterPhone] = useState('');
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [clientMasterState, setClientMasterState] = useState('');
  const [counterpartyState, setCounterpartyState] = useState('');

  // Fetch live CoinUSDT rate for non-USDT assets
  useEffect(() => {
    if (open && isNonUsdt) {
      fetchCoinMarketRate(assetCode).then(rate => setCoinUsdtRate(rate));
    } else if (!isNonUsdt) {
      setCoinUsdtRate(1.0);
    }
  }, [open, assetCode, isNonUsdt]);

  // Resolve PAN/contact/state from safe sources when dialog opens or client mapping changes
  useEffect(() => {
    if (!open || !syncRecord?.counterparty_name) return;

    const nicknameRaw = syncRecord.order_data?.counterparty_nickname || syncRecord.counterparty_name;
    const nickname = (nicknameRaw || '').trim();
    const isMaskedNickname = nickname.includes('*');

    const fetchResolvedData = async () => {
      let cMasterPan = '';
      let cPartyPan = '';
      let cMasterPhone = '';
      let cPartyPhone = '';
      let cMasterState = '';
      let cPartyState = '';

      const selectedClient = linkedClientId || syncRecord?.client_id || '';

      // 1) Fetch client master data
      if (selectedClient) {
        const { data: clientRec } = await supabase
          .from('clients')
          .select('pan_card_number, phone, state')
          .eq('id', selectedClient)
          .maybeSingle();

        if (clientRec) {
          cMasterPan = clientRec.pan_card_number || '';
          cMasterPhone = clientRec.phone || '';
          cMasterState = clientRec.state || '';
        }
      }

      // 2) Fetch counterparty records (PAN + contact) — only when nickname is unmasked
      if (nickname && !isMaskedNickname) {
        const { data: panRec } = await supabase
          .from('counterparty_pan_records')
          .select('pan_number')
          .eq('counterparty_nickname', nickname)
          .maybeSingle();
        if (panRec?.pan_number) cPartyPan = panRec.pan_number;

        const { data: contactRec } = await supabase
          .from('counterparty_contact_records')
          .select('contact_number, state')
          .eq('counterparty_nickname', nickname)
          .maybeSingle();
        if (contactRec?.contact_number) cPartyPhone = contactRec.contact_number;
        if (contactRec?.state) cPartyState = contactRec.state;
      }

      // Store both sources for conflict detection
      setClientMasterPan(cMasterPan);
      setCounterpartyPan(cPartyPan);
      setClientMasterPhone(cMasterPhone);
      setCounterpartyPhone(cPartyPhone);
      setClientMasterState(cMasterState);
      setCounterpartyState(cPartyState);

      // Auto-resolve: sync record PAN (entered in terminal) wins, then counterparty, then client master
      const syncPan = syncRecord?.pan_number || '';
      const resolvedPan = syncPan || cPartyPan || cMasterPan;
      setPanNumber(resolvedPan);
      setTdsOption(resolvedPan ? '1%' : '20%');

      // Auto-resolve contact/state: counterparty records (terminal-captured) > client master
      const resolvedPhone = cPartyPhone || cMasterPhone;
      const resolvedState = cPartyState || cMasterState;
      setContactNumber(resolvedPhone);
      setClientState(resolvedState);

      if (!linkedClientId) {
        setLinkedClientId(syncRecord?.client_id || '');
      }
      
      // Check for multiple clients with same name (disambiguation needed)
      if (!linkedClientId && !syncRecord?.client_id && syncRecord?.counterparty_name) {
        const matches = await findAllClientsByName(syncRecord.counterparty_name);
        if (matches.length > 1) {
          setDuplicateClients(matches);
        } else {
          setDuplicateClients([]);
        }
      }
    };

    fetchResolvedData();
  }, [open, syncRecord, linkedClientId]);


  // Build conflict items for the banner
  const dataConflicts = useMemo(() => {
    const items: { field: string; clientValue: string; counterpartyValue: string; onChoose: (v: string) => void }[] = [];
    if (clientMasterPan && counterpartyPan && clientMasterPan !== counterpartyPan) {
      items.push({
        field: 'PAN',
        clientValue: clientMasterPan,
        counterpartyValue: counterpartyPan,
        onChoose: (v) => { setPanNumber(v); setTdsOption(v ? '1%' : '20%'); },
      });
    }
    if (clientMasterPhone && counterpartyPhone && clientMasterPhone !== counterpartyPhone) {
      items.push({ field: 'Phone', clientValue: clientMasterPhone, counterpartyValue: counterpartyPhone, onChoose: setContactNumber });
    }
    if (clientMasterState && counterpartyState && clientMasterState !== counterpartyState) {
      items.push({ field: 'State', clientValue: clientMasterState, counterpartyValue: counterpartyState, onChoose: setClientState });
    }
    return items;
  }, [clientMasterPan, counterpartyPan, clientMasterPhone, counterpartyPhone, clientMasterState, counterpartyState]);

  // Fetch bank accounts
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products (for USDT product ID)
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  // Find product matching the order asset (USDT, BTC, etc.)
  const matchedProduct = useMemo(() => {
    const asset = (od.asset || 'USDT').toUpperCase();
    return products.find((p: any) => 
      p.name?.toUpperCase() === asset || p.code?.toUpperCase() === asset
    );
  }, [products, od.asset]);

  // TDS calculation
  const totalAmount = parseFloat(od.total_price) || 0;
  const tdsRate = tdsOption === '1%' ? 1 : tdsOption === '20%' ? 20 : 0;
  const tdsAmount = totalAmount * (tdsRate / 100);
  const netPayable = totalAmount - tdsAmount;


  // Split payment allocation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) =>
      sum + (parseFloat(s.amount) || 0), 0);
    const remaining = netPayable - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.bank_account_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, netPayable]);

  // Auto-fill first split amount when net payable changes
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && netPayable > 0) {
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: netPayable.toFixed(2) }]);
      }
    }
  }, [isMultiplePayments, netPayable]);

  const addPaymentSplit = () => {
    setPaymentSplits(prev => [...prev, { bank_account_id: '', amount: '' }]);
  };

  const removePaymentSplit = (index: number) => {
    if (paymentSplits.length > 1) {
      setPaymentSplits(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updatePaymentSplit = (index: number, field: keyof PaymentSplit, value: string) => {
    setPaymentSplits(prev => prev.map((split, i) =>
      i === index ? { ...split, [field]: value } : split
    ));
  };

  // Create client mutation (fallback if auto-creation didn't trigger)
  const createClientMutation = useMutation({
    mutationFn: async () => {
      const nickname = syncRecord?.order_data?.counterparty_nickname || syncRecord?.counterparty_name;
      // Only look up contact for unmasked nicknames to prevent cross-contamination
      let contactPhone: string | undefined;
      if (nickname && !nickname.includes('*')) {
        const { data: contactRec } = await supabase
          .from('counterparty_contact_records')
          .select('contact_number')
          .eq('counterparty_nickname', nickname)
          .maybeSingle();
        contactPhone = contactRec?.contact_number || undefined;
      }

      // Block client creation with masked nicknames or unknown names
      const clientName = syncRecord.counterparty_name;
      if (!clientName || clientName === 'Unknown' || clientName.includes('*')) {
        throw new Error('Cannot create client with a masked or unknown name. Please resolve the verified name first.');
      }
      const clientData = await createSellerClient(
        clientName,
        contactPhone
      );
      return clientData;
    },
    onSuccess: (client: any) => {
      setLinkedClientId(client.id);
      toast({ title: "Client Created", description: `${syncRecord.counterparty_name} added as seller client` });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const userId = await requireCurrentUserId();

      // Validate
      if (tdsOption === '1%' && !panNumber.trim()) {
        throw new Error("PAN is required for 1% TDS");
      }


      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          throw new Error(`Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)} (must be ₹0.00)`);
        }
        // Check for duplicate banks
        const bankIds = paymentSplits.map(s => s.bank_account_id);
        if (new Set(bankIds).size !== bankIds.length) {
          throw new Error("Each bank account can only be used once in split payments");
        }
      } else {
        if (!bankAccountId) {
          throw new Error("Please select a bank account");
        }
      }

      let result: any;
      let rpcError: any;
      const orderNumber = od.order_number || syncRecord?.binance_order_number || `TRM-${Date.now()}`;

      // Recovery path for historical partial approvals:
      // if a purchase order already exists for this terminal order, reuse it.
      const { data: existingPurchase } = await supabase
        .from('purchase_orders')
        .select('id, terminal_sync_id')
        .or(`terminal_sync_id.eq.${syncRecord.id},order_number.eq.${orderNumber}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPurchase?.terminal_sync_id && existingPurchase.terminal_sync_id !== syncRecord.id) {
        throw new Error('This order is already linked to another terminal sync record. Please refresh the queue.');
      }

      if (existingPurchase?.id) {
        result = { success: true, purchase_order_id: existingPurchase.id, recovered: true };
      } else if (isMultiplePayments) {
        const splitPaymentsJson = paymentSplits.map(s => ({
          bank_account_id: s.bank_account_id,
          amount: parseFloat(s.amount)
        }));

        // Net quantity = gross amount - commission (fee is deducted from received coins)
        const grossQty = parseFloat(od.amount) || 0;
        const commission = parseFloat(od.commission) || 0;
        const netQty = grossQty - commission;

        // Convert settlement date to IST date to avoid UTC date truncation
        const istOrderDate = new Date(settlementDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const rpcParams = {
          p_order_number: orderNumber,
          p_supplier_name: syncRecord.counterparty_name,
          p_order_date: istOrderDate,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id,
          p_quantity: netQty,
          p_unit_price: parseFloat(od.unit_price) || 0,
          p_description: `Terminal P2P Purchase - ${od.order_number}${remarks ? ` | ${remarks}` : ''} | Gross: ${grossQty}, Fee: ${commission}`,
          p_credit_wallet_id: od.wallet_id || undefined,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || undefined,
          p_fee_percentage: undefined,
          p_is_off_market: false,
          p_created_by: userId || undefined,
          p_payment_splits: splitPaymentsJson,
        };

        const { data, error } = await supabase.rpc('create_manual_purchase_with_split_payments_rpc' as any, rpcParams);
        result = data;
        rpcError = error;
      } else {
        // Net quantity = gross amount - commission (fee is deducted from received coins)
        const grossQty = parseFloat(od.amount) || 0;
        const commission = parseFloat(od.commission) || 0;
        const netQty = grossQty - commission;

        // Convert settlement date to IST date to avoid UTC date truncation
        const istOrderDate2 = new Date(settlementDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const rpcParams = {
          p_order_number: orderNumber,
          p_supplier_name: syncRecord.counterparty_name,
          p_order_date: istOrderDate2,
          p_total_amount: totalAmount,
          p_product_id: matchedProduct?.id || null,
          p_quantity: netQty,
          p_unit_price: parseFloat(od.unit_price) || 0,
          p_bank_account_id: bankAccountId,
          p_description: `Terminal P2P Purchase - ${od.order_number}${remarks ? ` | ${remarks}` : ''} | Gross: ${grossQty}, Fee: ${commission}`,
          p_credit_wallet_id: od.wallet_id || null,
          p_tds_option: tdsOption,
          p_pan_number: panNumber || null,
          p_fee_percentage: null,
          p_is_off_market: false,
          p_created_by: userId || null,
          p_contact_number: contactNumber || null,
        };

        const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2_rpc' as any, rpcParams);
        result = data;
        rpcError = error;
      }

      if (rpcError) throw rpcError;
      if (result && !result.success) {
        throw new Error(result.error || 'Purchase creation failed');
      }

      // Update sync record
      const { error: updateErr } = await supabase
        .from('terminal_purchase_sync')
        .update({
          sync_status: 'approved',
          purchase_order_id: result?.purchase_order_id || null,
          client_id: linkedClientId || null,
          pan_number: panNumber || null,
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', syncRecord.id);
      if (updateErr) throw updateErr;

      // Sync PAN/contact/state to linked client master — save if missing on client.
      if (linkedClientId) {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('phone, state, pan_card_number')
          .eq('id', linkedClientId)
          .maybeSingle();

        const updates: any = {};
        // PAN: overwrite if operator-confirmed value differs from client master
        if (panNumber && existingClient?.pan_card_number !== panNumber) {
          updates.pan_card_number = panNumber;
        }

        // Phone/state: use operator-confirmed form values (already resolved from counterparty/client)
        if (contactNumber && existingClient?.phone !== contactNumber) updates.phone = contactNumber;
        if (clientState && existingClient?.state !== clientState) updates.state = clientState;

        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', linkedClientId);
        }
      }

      // Update purchase_orders source, market_rate_usdt, and fee
      if (result?.purchase_order_id) {
        const asset = (od.asset || 'USDT').toUpperCase();
        const marketRateUsdt = await fetchCoinMarketRate(asset);

        // Calculate fee in USDT equivalent
        const rawCommission = Number(od.commission || 0);
        const feeUsdt = asset === 'USDT' ? rawCommission : rawCommission * (marketRateUsdt > 0 ? marketRateUsdt : 0);

        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal',
            terminal_sync_id: syncRecord.id,
            market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
            fee_amount: feeUsdt > 0 ? feeUsdt : null,
          })
          .eq('id', result.purchase_order_id);

        // Update WAC cost pool for non-USDT assets so Realized P&L calculates correctly
        if (asset !== 'USDT' && marketRateUsdt > 0) {
          const grossQtyVal = parseFloat(od.amount) || 0;
          const commissionVal = parseFloat(od.commission) || 0;
          const netQtyVal = grossQtyVal - commissionVal;
          const costUsdt = netQtyVal * marketRateUsdt;
          const walletId = od.wallet_id;

          if (walletId && netQtyVal > 0) {
            // Upsert into wallet_asset_positions to track WAC
            const { data: existingPos } = await supabase
              .from('wallet_asset_positions' as any)
              .select('id, qty_on_hand, cost_pool_usdt, avg_cost_usdt')
              .eq('wallet_id', walletId)
              .eq('asset_code', asset)
              .maybeSingle();

            const pos = existingPos as any;
            if (pos) {
              const newQty = Number(pos.qty_on_hand || 0) + netQtyVal;
              const newPool = Number(pos.cost_pool_usdt || 0) + costUsdt;
              const newAvg = newQty > 0 ? newPool / newQty : 0;
              await supabase
                .from('wallet_asset_positions' as any)
                .update({
                  qty_on_hand: newQty,
                  cost_pool_usdt: newPool,
                  avg_cost_usdt: newAvg,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', pos.id);
            } else {
              await supabase
                .from('wallet_asset_positions' as any)
                .insert({
                  wallet_id: walletId,
                  asset_code: asset,
                  qty_on_hand: netQtyVal,
                  cost_pool_usdt: costUsdt,
                  avg_cost_usdt: marketRateUsdt,
                });
            }
          }
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Purchase Approved", description: "Terminal order has been approved and purchase created" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
      queryClient.invalidateQueries({ queryKey: ['beneficiary_records'] });
      onSuccess();
    },
    onError: (err: Error) => {
      const { title, description } = parseApprovalError(err, 'Purchase');
      toast({ title, description, variant: "destructive" });
    },
  });

  const orderDate = od.create_time ? format(new Date(od.create_time), 'dd MMM yyyy, HH:mm') : '—';

  const isSubmitDisabled = approveMutation.isPending || 
    !linkedClientId ||
    (isMultiplePayments ? !splitAllocation.isValid : !bankAccountId) ||
    (tdsOption === '1%' && !panNumber.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Approve Terminal Purchase</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only Terminal Data */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Lock className="h-3 w-3" />
                Terminal Data (Read-Only)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <LockedField label="Order Number" value={od.order_number} />
                <LockedField label="Order Date" value={orderDate} />
                <LockedField label="Asset" value={od.asset || 'USDT'} />
                <LockedField label="Quantity" value={`${Number(od.amount || 0).toLocaleString('en-IN')} ${assetCode}`} />
                <LockedField label="Price Per Unit" value={`₹${Number(od.unit_price || 0).toLocaleString('en-IN')}`} />
                <LockedField label="Total Amount" value={`₹${totalAmount.toLocaleString('en-IN')}`} />
                <LockedField
                  label="Commission/Fee"
                  value={
                    isNonUsdt && coinUsdtRate && coinUsdtRate > 0
                      ? `${Number(od.commission || 0).toLocaleString('en-IN')} ${assetCode} ≈ ${formatSmartDecimal(Number(od.commission || 0) * coinUsdtRate, 4)} USDT`
                      : `${Number(od.commission || 0).toLocaleString('en-IN')} USDT`
                  }
                />
                <LockedField label="Wallet" value={od.wallet_name || '—'} />
                <LockedField label="Seller Name" value={syncRecord?.counterparty_name || '—'} />
                <LockedField label="Payment Method" value={od.pay_method || '—'} />
              </div>
            </CardContent>
          </Card>

          {/* Client Mapping */}
          <Card className="border-blue-100 bg-blue-50/30">
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs font-semibold">Client Mapping</Label>
              {linkedClientId ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{linkedClientName || syncRecord?.counterparty_name}</span>
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Linked</Badge>
                  {duplicateClients.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => { setLinkedClientId(''); setLinkedClientName(''); }}
                    >
                      Change
                    </Button>
                  )}
                </div>
              ) : duplicateClients.length > 1 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-600">
                    <Users className="h-4 w-4" />
                    <span className="text-sm font-medium">Multiple clients found with name "{syncRecord?.counterparty_name}" — select the correct one</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {duplicateClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => { setLinkedClientId(client.id); setLinkedClientName(client.name); setDuplicateClients(duplicateClients); }}
                        className="w-full text-left p-2 rounded border hover:bg-accent/50 transition-colors text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{client.name}</span>
                          <Badge variant="outline" className="text-[9px]">{client.client_id}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-3">
                          <span>📱 {client.phone || 'No phone'}</span>
                          <span>📍 {client.state || 'No state'}</span>
                          <span>🆔 PAN: {client.pan_card_number || 'N/A'}</span>
                          <span>{client.is_seller ? '✅ Seller' : ''} {client.is_buyer ? '✅ Buyer' : ''}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-destructive font-medium">⚠ Approval blocked until client is selected</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">No matching client found — create to approve</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => createClientMutation.mutate()}
                      disabled={createClientMutation.isPending}
                    >
                      {createClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                      Create Client
                    </Button>
                  </div>
                  <p className="text-[10px] text-destructive font-medium">⚠ Approval blocked until client is created</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Conflict Banner */}
          <DataConflictBanner conflicts={dataConflicts} />

          {/* TDS & PAN */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">TDS Option</Label>
              <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="none">No TDS</SelectItem>
                  <SelectItem value="1%">1% TDS (PAN available)</SelectItem>
                  <SelectItem value="20%">20% TDS (No PAN)</SelectItem>
                </SelectContent>
              </Select>
              {tdsOption !== 'none' && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  TDS: ₹{tdsAmount.toLocaleString('en-IN')} | Net Payable: ₹{netPayable.toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">PAN Number</Label>
              <Input
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className="mt-1 h-9 text-sm font-mono"
                maxLength={10}
              />
            </div>
          </div>

          {/* Contact Number & State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Contact Number</Label>
              <Input
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Seller contact number"
                className="mt-1 h-9 text-sm"
                maxLength={15}
              />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Select value={clientState} onValueChange={setClientState}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="bg-popover border z-50 max-h-[200px]">
                  {INDIAN_STATES_AND_UTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bank Account with Split Payment Toggle */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Bank Account (Deduction)</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="split_payment_toggle"
                    checked={isMultiplePayments}
                    onCheckedChange={(checked) => {
                      setIsMultiplePayments(checked === true);
                      if (checked) {
                        setPaymentSplits([{
                          bank_account_id: bankAccountId || '',
                          amount: netPayable > 0 ? netPayable.toFixed(2) : ''
                        }]);
                      } else {
                        setPaymentSplits([{ bank_account_id: '', amount: '' }]);
                      }
                    }}
                  />
                  <Label htmlFor="split_payment_toggle" className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                    Split Payment
                  </Label>
                </div>
              </div>
              {!isMultiplePayments ? (
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50">
                    {bankAccounts.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.account_name} - ₹{Number(b.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 h-9 flex items-center">
                  Configure below
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Order Date & Time</Label>
              <Input
                type="datetime-local"
                value={settlementDate.slice(0, 16)}
                disabled
                className="mt-1 h-9 text-sm bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Actual Binance order time (not editable)</p>
            </div>
          </div>

          {/* Split Payment Distribution */}
          {isMultiplePayments && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">Payment Distribution</Label>
                    {splitAllocation.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>

                {/* Status Bar */}
                <div className="grid grid-cols-3 gap-4 text-sm bg-background/80 rounded-lg p-3 border">
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px] mb-1">Net Payable</div>
                    <div className="font-semibold text-xs">₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="text-center border-x">
                    <div className="text-muted-foreground text-[10px] mb-1">Allocated</div>
                    <div className="font-medium text-xs">₹{splitAllocation.totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground text-[10px] mb-1">Remaining</div>
                    <div className={`font-semibold text-xs ${splitAllocation.isValid ? "text-green-600" : "text-destructive"}`}>
                      ₹{splitAllocation.remaining.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Payment Rows */}
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-1">
                    <div className="col-span-4">Amount (₹)</div>
                    <div className="col-span-7">Bank Account</div>
                    <div className="col-span-1"></div>
                  </div>

                  {paymentSplits.map((split, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={split.amount}
                          onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-7">
                        <Select
                          value={split.bank_account_id}
                          onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select bank" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border border-border shadow-lg z-50">
                            {bankAccounts.map((account: any) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.account_name} - ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePaymentSplit(index)}
                          disabled={paymentSplits.length === 1}
                          className="h-8 w-8"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPaymentSplit}
                  className="w-full"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Another Bank
                </Button>
              </CardContent>
            </Card>
          )}


          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks..."
              className="mt-1 text-sm"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => approveMutation.mutate()}
            disabled={isSubmitDisabled}
          >
            {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve & Create Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}
