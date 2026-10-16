import { useState, useMemo, useEffect, useRef } from "react";
import { parseApprovalError } from "@/utils/approvalErrorParser";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { fetchAndLockMarketRate, linkSnapshotToReference } from "@/lib/effectiveUsdtEngine";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, Plus, Minus, Users, Info, ShoppingBag, Building2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { requireCurrentUserId } from "@/lib/system-action-logger";
import { createSellerClient, findAllClientsByName } from "@/utils/clientIdGenerator";
import { resolveOrderUserNo, sanitizeVerifiedName, linkClientUserNo } from "@/lib/clientIdentityResolver";
import { DataConflictBanner } from "@/components/terminal/DataConflictBanner";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { filterNonAdjustmentBanks } from "@/lib/adjustment-accounts";
import {
  Callout,
  Chip,
  CopyButton,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  Field,
  FieldGrid,
  OrderNo,
  Section,
  SummaryRow,
  dialogContentClass,
  fmtAssetQty,
  fmtDateTime,
  fmtInr,
  fmtRate,
} from "@/components/orders-ui";
import { cn } from "@/lib/utils";

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
  const [autoMatchVia, setAutoMatchVia] = useState<string | null>(null);

  // Conflict tracking between client master and counterparty records
  const [clientMasterPan, setClientMasterPan] = useState('');
  const [counterpartyPan, setCounterpartyPan] = useState('');
  const [clientMasterPhone, setClientMasterPhone] = useState('');
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [clientMasterState, setClientMasterState] = useState('');
  const [counterpartyState, setCounterpartyState] = useState('');
  // Binance userNo (stable account identity) lock — when resolved, client cannot be changed
  const [userNoLocked, setUserNoLocked] = useState(false);
  const [lockedUserNo, setLockedUserNo] = useState<string | null>(null);
  // Tracks the on-demand userNo resolution lifecycle. Approval is blocked until
  // this settles: no order may be approved until its Binance userNo is inferred.
  const [userNoResolving, setUserNoResolving] = useState(false);

  // True once the operator explicitly picks/creates/unlinks a client — prevents
  // the auto-match effect from clobbering or re-validating a human decision.
  const manualSelectionRef = useRef(false);

  // Resolve & LOCK client by Binance userNo (highest-confidence identity anchor).
  // userNo is the stable, unique Binance account id — the primary identity key.
  // If it isn't cached yet for a fresh order, resolveOrderUserNo fetches order-detail on demand.
  useEffect(() => {
    if (!open) { setUserNoLocked(false); setLockedUserNo(null); setUserNoResolving(false); manualSelectionRef.current = false; return; }
    const orderNumber = od?.order_number || syncRecord?.binance_order_number;
    if (!orderNumber) return;

    let cancelled = false;
    setUserNoResolving(true);
    resolveOrderUserNo({
      orderNumber: String(orderNumber),
      tradeType: 'BUY', // our purchase flow: WE buy, counterparty is the seller
      exchangeAccountId: syncRecord?.exchange_account_id ?? od?.exchange_account_id ?? null,
    }).then((res) => {
      if (cancelled) return;
      if (res.cpUserNo) setLockedUserNo(String(res.cpUserNo));
      if (!res.clientId) return;
      setLinkedClientId(res.clientId);
      setLinkedClientName(res.clientName || '');
      setAutoMatchVia('userno');
      setUserNoLocked(true);
    }).finally(() => {
      if (!cancelled) setUserNoResolving(false);
    });
    return () => { cancelled = true; };
  }, [open, od?.order_number, syncRecord?.binance_order_number]);



  // Fetch live CoinUSDT rate for non-USDT assets
  useEffect(() => {
    if (open && isNonUsdt) {
      fetchAndLockMarketRate(assetCode, { entryType: 'terminal_purchase_preview' })
        .then(locked => setCoinUsdtRate(locked.price))
        .catch(() => setCoinUsdtRate(null));
    } else if (!isNonUsdt) {
      setCoinUsdtRate(1.0);
    }
  }, [open, assetCode, isNonUsdt]);

  // Resolve PAN/contact/state from safe sources when dialog opens or client mapping changes
  useEffect(() => {
    if (!open || !syncRecord?.counterparty_name) return;

    const fetchResolvedData = async () => {
      let cMasterPan = '';
      let cMasterPhone = '';
      let cMasterState = '';

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

      // Store both sources for conflict detection
      setClientMasterPan(cMasterPan);
      setCounterpartyPan('');
      setClientMasterPhone(cMasterPhone);
      setCounterpartyPhone('');
      setClientMasterState(cMasterState);
      setCounterpartyState('');

      // Auto-resolve: sync record PAN (entered in terminal) wins, then client master.
      // Do not read counterparty_contact_records here: those rows are nickname-keyed
      // display data and can belong to a different Binance userNo.
      const syncPan = syncRecord?.pan_number || '';
      const resolvedPan = syncPan || cMasterPan;
      setPanNumber(resolvedPan);
      setTdsOption(resolvedPan ? '1%' : '20%');

      setContactNumber(cMasterPhone);
      setClientState(cMasterState);

      // Client binding is driven strictly by Binance userNo (the userNo effect
      // above). No nickname / verified-name / display-name matching here.
    };


    fetchResolvedData();
  }, [open, syncRecord, linkedClientId, userNoLocked]);


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
      return filterNonAdjustmentBanks(data || []);
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
      const unmasked = syncRecord?.order_data?.counterparty_nickname_unmasked || '';
      let lookupNick = unmasked || '';
      if (!lookupNick && nickname && !nickname.includes('*')) {
        lookupNick = nickname;
      }
      if (!lookupNick && nickname?.includes('*') && syncRecord?.binance_order_number) {
        const { data: p2pRec } = await supabase
          .from('p2p_order_records')
          .select('counterparty_nickname')
          .eq('binance_order_number', syncRecord.binance_order_number)
          .maybeSingle();
        if (p2pRec?.counterparty_nickname && !p2pRec.counterparty_nickname.includes('*')) {
          lookupNick = p2pRec.counterparty_nickname.trim();
        }
      }

      // Block client creation with masked nicknames or unknown names
      const clientName = syncRecord.counterparty_name;
      if (!clientName || clientName === 'Unknown' || clientName.includes('*')) {
        throw new Error('Cannot create client with a masked or unknown name. Please resolve the verified name first.');
      }
      const verifiedNameRaw = od.verified_name || '';
      const cleanVerifiedName = sanitizeVerifiedName(verifiedNameRaw);
      if (!lockedUserNo) {
        throw new Error('Binance User No is not resolved yet. Client creation is blocked until this order identity is available.');
      }
      const clientData = await createSellerClient(
        clientName,
        contactNumber.trim() || undefined,
        {
          binanceNickname: lookupNick || null,
          verifiedName: cleanVerifiedName,
          cpUserNo: lockedUserNo,
        }
      );
      if (!clientData?.id) {
        throw new Error('Seller client creation returned no record. Please retry or check the database logs.');
      }
      return clientData;
    },
    onSuccess: (client: any) => {
      if (!client?.id) {
        toast({ title: "Error", description: "Client creation returned no ID.", variant: "destructive" });
        return;
      }
      manualSelectionRef.current = true;
      setLinkedClientId(client.id);
      setLinkedClientName(syncRecord?.counterparty_name || '');
      if (lockedUserNo) setUserNoLocked(true);
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

      // Hard gate: never approve an order whose Binance userNo hasn't been inferred.
      if (userNoResolving) {
        throw new Error("Still inferring the Binance User No for this order — please wait.");
      }
      // userNo is the mandatory identity anchor — no manual override.
      if (!lockedUserNo) {
        throw new Error("Binance User No could not be inferred for this order. Approval is blocked until it resolves.");
      }



      // Validate
      if (tdsOption === '1%' && !panNumber.trim()) {
        throw new Error("PAN is required for 1% TDS");
      }
      if (panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber.trim().toUpperCase())) {
        throw new Error("Invalid PAN format. Expected format: AAAAA9999A (e.g. ABCDE1234F)");
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
          p_pan_number: tdsOption === '20%' ? undefined : (panNumber || undefined),
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
          p_pan_number: tdsOption === '20%' ? null : (panNumber || null),
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

        // Persist the Binance userNo → client link (the only identity anchor).
        if (lockedUserNo) {
          await linkClientUserNo(linkedClientId, lockedUserNo, 'approval');
        }
      }



      // Update purchase_orders source, market_rate_usdt, and fee
      if (result?.purchase_order_id) {
        const asset = (od.asset || 'USDT').toUpperCase();
        const locked = await fetchAndLockMarketRate(asset, {
          entryType: 'purchase_approval',
          referenceId: result.purchase_order_id,
          referenceType: 'purchase_order',
        });
        const marketRateUsdt = locked.price;

        // Calculate fee in USDT equivalent
        const rawCommission = Number(od.commission || 0);
        const feeUsdt = asset === 'USDT' ? rawCommission : rawCommission * (marketRateUsdt > 0 ? marketRateUsdt : 0);

        const grossQtyForUsdt = parseFloat(od.amount) || 0;
        const commissionForUsdt = parseFloat(od.commission) || 0;
        const netQtyForUsdt = grossQtyForUsdt - commissionForUsdt;
        const effectiveRate = marketRateUsdt > 0 ? marketRateUsdt : 1;
        const effectiveUsdtQty = netQtyForUsdt * effectiveRate;
        const effectiveUsdtRate = effectiveUsdtQty > 0 ? totalAmount / effectiveUsdtQty : null;

        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal',
            terminal_sync_id: syncRecord.id,
            market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
            fee_amount: feeUsdt > 0 ? feeUsdt : null,
            effective_usdt_qty: effectiveUsdtQty,
            effective_usdt_rate: effectiveUsdtRate,
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
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      queryClient.invalidateQueries({ queryKey: ['beneficiary_records'] });
      onSuccess();
    },
    onError: (err: Error) => {
      const { title, description } = parseApprovalError(err, 'Purchase');
      toast({ title, description, variant: "destructive" });
    },
  });

  const orderDate = od.create_time ? fmtDateTime(od.create_time) : '—';

  const isSubmitDisabled = approveMutation.isPending || 
    userNoResolving || !lockedUserNo ||
    !linkedClientId ||
    (isMultiplePayments ? !splitAllocation.isValid : !bankAccountId);

  // ── Presentation only: derived from this record and the state above; nothing here is saved ──
  const accountId = syncRecord?.exchange_account_id ?? od?.exchange_account_id ?? null;
  const paymentDetails = od.seller_payment_details && typeof od.seller_payment_details === 'object' ? od.seller_payment_details : null;
  const paidToName = str(paymentDetails?.accountName);
  const paidToBank = str(paymentDetails?.bankName);
  const paidToAccount = str(paymentDetails?.accountNo);
  const paidToIfsc = str(paymentDetails?.ifscCode);
  const paidToIsUpi = isUpiPayment || paidToAccount.includes('@');
  const payMethodLabel = str(paymentDetails?.payType) || od.pay_method || '—';
  const creditedQty = (parseFloat(od.amount) || 0) - (parseFloat(od.commission) || 0);
  const feeUsdtHint = isNonUsdt && coinUsdtRate && coinUsdtRate > 0
    ? `≈ ${formatSmartDecimal(Number(od.commission || 0) * coinUsdtRate, 4)} USDT`
    : null;
  // Why Approve is disabled: the conditions of isSubmitDisabled, in the same order.
  const blockingReason = approveMutation.isPending ? null
    : userNoResolving ? 'Waiting for the Binance User No…'
    : !lockedUserNo ? 'Blocked until the Binance User No is inferred'
    : !linkedClientId ? (duplicateClients.length > 1 ? 'Select the seller client to approve' : 'Create the seller client to approve')
    : isMultiplePayments
      ? (!splitAllocation.isValid
        ? (Math.abs(splitAllocation.remaining) > 0.01 ? `Remaining ${inr2(splitAllocation.remaining)} must be ₹0.00` : 'Choose a bank and an amount on every row')
        : null)
      : (!bankAccountId ? 'Select a bank account to approve' : null);

  const bankOption = (b: any) => (
    <>
      {b.account_name}
      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{inr2(Number(b.balance))}</span>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("xl")}>
        <DialogHead
          icon={ShoppingBag}
          title="Approve terminal purchase"
          description="Books this Binance buy as an ERP purchase order and records the bank payment."
          meta={
            <>
              <span className="inline-flex items-center gap-0.5">
                <OrderNo value={od.order_number} />
                <CopyButton value={od.order_number} label="Copy order number" />
              </span>
              <CachedAccountChip accountId={accountId} />
            </>
          }
        />

        <DialogBody>
          {/* Read-only Terminal data */}
          <Section
            title={sectionTitle("Binance order")}
            icon={Lock}
            actions={<span className="text-[11px] text-muted-foreground">Read-only</span>}
            boxed
          >
            <Facts
              cols={3}
              className="grid-cols-2"
              items={[
                {
                  label: 'Amount',
                  value: <span className="text-lg font-semibold leading-7 tabular-nums">{fmtInr(totalAmount)}</span>,
                  className: 'col-span-2 sm:col-span-1',
                },
                { label: 'Quantity', value: <span className="tabular-nums">{fmtAssetQty(od.amount, assetCode)}</span> },
                { label: `Price per ${assetCode}`, value: <span className="tabular-nums">{fmtRate(od.unit_price)}</span> },
                { label: 'Fee', value: <span className="tabular-nums">{fmtAssetQty(od.commission, assetCode)}</span>, hint: feeUsdtHint },
                { label: 'Seller', value: syncRecord?.counterparty_name || '—' },
                { label: 'Order time', value: orderDate },
                { label: 'Payment method', value: payMethodLabel },
                paidToName || paidToBank ? { label: 'Paid to', value: paidToName || '—', hint: paidToBank || undefined } : null,
                paidToAccount
                  ? {
                      label: paidToIsUpi ? 'UPI ID' : 'Account number',
                      value: paidToAccount,
                      mono: true,
                      hint: paidToIfsc ? <span className="font-mono">IFSC {paidToIfsc}</span> : undefined,
                    }
                  : null,
              ]}
            />
          </Section>

          {/* Client mapping */}
          <Section title={sectionTitle("Seller client")}>
            <div className="space-y-3">
              {userNoResolving && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Inferring Binance User No for this order…
                </p>
              )}
              {!userNoResolving && !lockedUserNo && (
                <Callout tone="danger" title="Binance User No not inferred">
                  Binance User No could not be inferred for this order (proxy issue, rate-limit, or an older order past Binance's identity window). Approval is blocked until it resolves — retry shortly.
                </Callout>
              )}

              {linkedClientId ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="break-words text-[13px] font-medium text-foreground">{linkedClientName || syncRecord?.counterparty_name}</span>
                      <Chip tone="success">Linked</Chip>
                      {userNoLocked ? (
                        <Chip tone="info" className="ml-auto" title={`Locked via Binance User No${lockedUserNo ? ` (${lockedUserNo})` : ''}`}>
                          <Lock className="h-3 w-3" aria-hidden />
                          User No locked
                        </Chip>
                      ) : (duplicateClients.length > 1 || autoMatchVia) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8"
                          onClick={() => { manualSelectionRef.current = true; setLinkedClientId(''); setLinkedClientName(''); setAutoMatchVia(null); }}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                    {autoMatchVia === 'userno' && (
                      <p className="mt-0.5 text-xs text-muted-foreground" title="Auto-linked by Binance userNo">
                        Auto-linked by Binance User No
                      </p>
                    )}
                  </div>
                </div>
              ) : duplicateClients.length > 1 ? (
                <div className="space-y-2">
                  <Callout tone="warning" icon={Users} title={`Multiple clients found with name "${syncRecord?.counterparty_name}" — select the correct one`} />
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {duplicateClients.map((client) => (
                      <button
                        type="button"
                        key={client.id}
                        onClick={() => { manualSelectionRef.current = true; setLinkedClientId(client.id); setLinkedClientName(client.name); setDuplicateClients(duplicateClients); }}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-foreground">{client.name}</span>
                          <OrderNo value={client.client_id} className="text-muted-foreground" />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>Phone {client.phone || '—'}</span>
                          <span>State {client.state || '—'}</span>
                          <span>PAN <span className="font-mono">{client.pan_card_number || '—'}</span></span>
                          {(client.is_seller || client.is_buyer) && (
                            <span>{[client.is_seller && 'Seller', client.is_buyer && 'Buyer'].filter(Boolean).join(' · ')}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-medium text-destructive">Approval blocked until client is selected</p>
                </div>
              ) : (
                <Callout tone="warning" icon={AlertCircle} title="No matching client found — create to approve">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span>Approval blocked until client is created.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => createClientMutation.mutate()}
                      disabled={createClientMutation.isPending}
                    >
                      {createClientMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Create client
                    </Button>
                  </div>
                </Callout>
              )}

              <FieldGrid>
                <Field label="Contact number" htmlFor="tpa-contact">
                  <Input
                    id="tpa-contact"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="Seller contact number"
                    maxLength={15}
                    inputMode="tel"
                  />
                </Field>
                <Field label="State" htmlFor="tpa-state">
                  <Select value={clientState} onValueChange={setClientState}>
                    <SelectTrigger id="tpa-state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {INDIAN_STATES_AND_UTS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGrid>
            </div>
          </Section>

          {/* Data Conflict Banner */}
          <DataConflictBanner conflicts={dataConflicts} />

          {/* TDS & PAN */}
          <Section title={sectionTitle("Tax")}>
            <FieldGrid>
              <Field label="TDS" htmlFor="tpa-tds">
                <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                  <SelectTrigger id="tpa-tds">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No TDS</SelectItem>
                    <SelectItem value="1%">1% TDS (with PAN)</SelectItem>
                    <SelectItem value="20%">20% TDS (without PAN)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="PAN number" htmlFor="tpa-pan" required={tdsOption === '1%'}>
                <Input
                  id="tpa-pan"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="font-mono"
                  maxLength={10}
                />
              </Field>
            </FieldGrid>
            {tdsOption !== 'none' && (
              <div className="mt-3 rounded-lg border border-border bg-card px-3 py-1">
                <SummaryRow label="Order amount" value={fmtInr(totalAmount)} />
                <SummaryRow label={`TDS at ${tdsOption}`} value={`−${fmtInr(tdsAmount)}`} />
                <SummaryRow label="Net payable" value={fmtInr(netPayable)} strong />
              </div>
            )}
          </Section>

          {/* Bank account with split payment toggle */}
          <Section
            title={sectionTitle("Payment")}
            actions={
              <div className="flex items-center gap-2">
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
                <Label htmlFor="split_payment_toggle" className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Split payment
                </Label>
              </div>
            }
          >
            {!isMultiplePayments ? (
              <Field label="Bank account" htmlFor="tpa-bank" hint={`The net payable of ${fmtInr(netPayable)} is deducted from this account.`}>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger id="tpa-bank">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {bankOption(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[9rem_minmax(0,1fr)_2.25rem] gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid" aria-hidden>
                  <span>Amount (₹)</span>
                  <span>Bank account</span>
                  <span />
                </div>

                {paymentSplits.map((split, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 rounded-lg border border-border/70 p-2 sm:grid-cols-[9rem_minmax(0,1fr)_2.25rem] sm:rounded-none sm:border-0 sm:p-0">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={split.amount}
                      onChange={(e) => updatePaymentSplit(index, 'amount', e.target.value)}
                      placeholder="0.00"
                      aria-label={`Amount for bank ${index + 1} (₹)`}
                      className="col-start-1 row-start-1 tabular-nums"
                    />
                    <Select
                      value={split.bank_account_id}
                      onValueChange={(value) => updatePaymentSplit(index, 'bank_account_id', value)}
                    >
                      <SelectTrigger
                        aria-label={`Bank account ${index + 1}`}
                        className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                      >
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account: any) => (
                          <SelectItem key={account.id} value={account.id}>
                            {bankOption(account)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePaymentSplit(index)}
                      disabled={paymentSplits.length === 1}
                      aria-label={`Remove bank ${index + 1}`}
                      title="Remove this bank"
                      className="col-start-2 row-start-1 h-9 w-9 text-muted-foreground sm:col-start-3"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPaymentSplit}
                  className="w-full"
                >
                  <Plus className="h-4 w-4" />
                  Add another bank
                </Button>

                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <SummaryRow label="Net payable" value={inr2(netPayable)} />
                  <SummaryRow label="Allocated" value={inr2(splitAllocation.totalAllocated)} />
                  <SummaryRow
                    label="Remaining"
                    value={inr2(splitAllocation.remaining)}
                    tone={splitAllocation.isValid ? 'positive' : 'negative'}
                    strong
                  />
                </div>
              </div>
            )}
          </Section>

          {/* Wallet and the (read-only) Binance order time */}
          <Section title={sectionTitle("Wallet and date")}>
            <FieldGrid>
              <Field
                label="Credit wallet"
                hint={creditedQty > 0 ? `Receives ${fmtAssetQty(creditedQty, assetCode)} (quantity minus fee)` : undefined}
              >
                <div className="flex h-9 min-w-0 items-center rounded-lg border border-dashed border-border bg-muted/40 px-3 text-sm text-foreground">
                  <span className="truncate">{od.wallet_name || '—'}</span>
                </div>
              </Field>
              <Field label="Order date & time (UTC)" htmlFor="tpa-order-time" hint="Actual Binance order time (not editable)">
                <Input
                  id="tpa-order-time"
                  type="datetime-local"
                  value={settlementDate.slice(0, 16)}
                  disabled
                  className="border-dashed bg-muted/40 tabular-nums disabled:cursor-default disabled:opacity-100"
                />
              </Field>
            </FieldGrid>
          </Section>

          <Field label="Remarks" htmlFor="tpa-remarks" hint="Added to the purchase order description.">
            <Textarea
              id="tpa-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional remarks…"
              className="min-h-[64px]"
              rows={2}
            />
          </Field>
        </DialogBody>

        <DialogFoot
          start={
            blockingReason ? (
              <span className="flex items-center gap-1.5">
                {userNoResolving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {blockingReason}
              </span>
            ) : undefined
          }
        >
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => approveMutation.mutate()}
            disabled={isSubmitDisabled}
          >
            {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {approveMutation.isPending ? 'Approving…' : 'Approve & create purchase'}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

/* ── Presentation helpers (private to this dialog) ─────────────────────── */

/**
 * Section heading text. Sized here too because a global phone rule in index.css
 * (max-width 767px: h3 { font-size: 1rem !important }) would otherwise blow the kit's 11px label up to 16px.
 */
function sectionTitle(text: string) {
  return <span className="text-[11px] leading-4">{text}</span>;
}

/** Trimmed display string ("" for null / undefined). */
function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** ₹ with Indian grouping and exactly two decimals (₹47,768.24, ₹0.00). Display only. */
function inr2(value: number): string {
  const n = Math.abs(value) < 0.005 ? 0 : value;
  return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Exchange-account chip read from the ['exchange-account-map'] cache that the lists' account badges
 * fill. It never fetches, so it is simply absent when nothing has cached the map yet.
 */
function CachedAccountChip({ accountId, className }: { accountId?: string | null; className?: string }) {
  const queryClient = useQueryClient();
  if (!accountId) return null;
  const map = queryClient.getQueryData(["exchange-account-map"]) as Map<string, { account_name?: string | null; color?: string | null }> | undefined;
  const account = map instanceof Map ? map.get(accountId) : undefined;
  if (!account?.account_name) return null;
  const label = account.account_name.replace(/\s*binance\s*$/i, "").trim() || account.account_name;
  return (
    <Chip tone="neutral" title={account.account_name} className={cn("max-w-full", className)}>
      {account.color ? (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
      ) : (
        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </Chip>
  );
}
