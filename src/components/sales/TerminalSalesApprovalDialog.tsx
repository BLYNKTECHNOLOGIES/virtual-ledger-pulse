import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { isPhoneBlocked } from "@/lib/blocked-phones";
import { parseApprovalError } from "@/utils/approvalErrorParser";
import { fetchAndLockMarketRate, linkSnapshotToReference } from "@/lib/effectiveUsdtEngine";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, AlertTriangle, Building2, Check, Info, Link2, Users, Plus, Minus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useToast } from "@/hooks/use-toast";
import { requireCurrentUserId } from "@/lib/system-action-logger";

interface PaymentSplit {
  payment_method_id: string;
  amount: string;
}

import { createBuyerClient } from "@/utils/clientIdGenerator";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, matchesWordPrefix } from "@/lib/utils";
import { resolveOrderUserNo, sanitizeNickname, sanitizeVerifiedName, linkClientUserNo } from "@/lib/clientIdentityResolver";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncRecord: any;
  onSuccess: () => void;
}

const normalizeIndianState = (value?: string | null): string => {
  if (!value) return '';
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const matchedState = INDIAN_STATES_AND_UTS.find(
    (state) => state.toLowerCase() === cleaned.toLowerCase()
  );

  return matchedState || '';
};

const hasTextValue = (value?: string | null): boolean => Boolean(value && value.trim().length > 0);

export function TerminalSalesApprovalDialog({ open, onOpenChange, syncRecord, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const od = syncRecord?.order_data || {};
  const [enrichedName, setEnrichedName] = useState<string | null>(null);
  // Never use masked nicknames as display name — force manual resolution
  const rawName = enrichedName || od.verified_name || syncRecord?.counterparty_name || '—';
  const displayName = (rawName.includes('*')) ? '—' : rawName;

  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [isMultiplePayments, setIsMultiplePayments] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ payment_method_id: '', amount: '' }]);
  const [settlementDate, setSettlementDate] = useState(
    od.create_time ? new Date(od.create_time).toISOString() : new Date().toISOString()
  );
  const [remarks, setRemarks] = useState('');
  const [contactNumber, setContactNumber] = useState(syncRecord?.contact_number || '');
  const [clientState, setClientState] = useState(normalizeIndianState(syncRecord?.state));
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');
  const [linkedClientName, setLinkedClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Long-press (touch & hold) support to preview a matched client's history on mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  // True once the operator explicitly picks/creates a client — prevents the
  // auto-match effect from clobbering or re-validating a human decision.
  const manualSelectionRef = useRef(false);
  const startClientPreviewPress = (id: string) => {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setHoveredClientId(id);
    }, 350);
  };
  const cancelClientPreviewPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const [clientAutoMatched, setClientAutoMatched] = useState(false);
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [counterpartyState, setCounterpartyState] = useState('');
  const [clientMasterPhone, setClientMasterPhone] = useState('');
  const [clientMasterState, setClientMasterState] = useState('');

  // Fetch all clients for matching
  const { data: allClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => supabase.from('clients').select('*').order('name'));
      return data || [];

    },
  });

  // Compute matching clients based on verified name
  const matchingClients = useMemo(() => {
    if (!displayName || displayName === '—' || allClients.length === 0) return [];
    const name = displayName.trim().toLowerCase();
    if (!name) return [];

    // Exact matches first, then partial/word-prefix matches
    const exact: any[] = [];
    const partial: any[] = [];

    for (const client of allClients) {
      if ((client as any).is_deleted) continue;
      if (client.buyer_approval_status === 'REJECTED') continue;

      const clientName = client.name.trim().toLowerCase();
      if (clientName === name) {
        exact.push(client);
      } else if (
        matchesWordPrefix(name, client.name) ||
        clientName.includes(name) ||
        name.includes(clientName)
      ) {
        partial.push(client);
      }
    }

    return [...exact, ...partial];
  }, [displayName, allClients]);

  // How the auto-match was resolved (only 'userno' auto-locks now).
  const [autoMatchVia, setAutoMatchVia] = useState<string | null>(null);
  // Binance userNo (stable account identity) lock — when resolved, client cannot be changed
  const [userNoLocked, setUserNoLocked] = useState(false);
  const [lockedUserNo, setLockedUserNo] = useState<string | null>(null);
  // Approval is blocked until this settles: no order may be approved until its
  // Binance userNo is inferred (on-demand resolution lifecycle flag).
  const [userNoResolving, setUserNoResolving] = useState(false);


  // Resolve & LOCK client STRICTLY by Binance userNo (the only identity anchor).
  // userNo is the stable, unique Binance account id. Nickname / verified-name /
  // display-name matching has been removed — it caused cross-contamination.
  // If userNo isn't cached for a fresh order, resolveOrderUserNo fetches
  // order-detail on demand. No userNo → operator must pick/create manually.
  // NOTE: `allClients` must NOT be a dependency here. The clients list is
  // refetched periodically; when it was a dep, every refetch aborted the
  // in-flight resolution (cancelled ⇒ `finally` skipped) and restarted it,
  // leaving `userNoResolving` permanently true and the Approve button disabled.
  const allClientsRef = useRef(allClients);
  allClientsRef.current = allClients;

  useEffect(() => {
    if (!open) { setUserNoLocked(false); setLockedUserNo(null); setUserNoResolving(false); manualSelectionRef.current = false; setAutoMatchVia(null); return; }
    const orderNumber = od?.order_number || syncRecord?.binance_order_number;
    if (!orderNumber) return;

    let cancelled = false;
    setUserNoResolving(true);
    resolveOrderUserNo({
      orderNumber: String(orderNumber),
      tradeType: 'SELL', // our sales flow: WE sell, counterparty is the buyer
      exchangeAccountId: syncRecord?.exchange_account_id ?? od?.exchange_account_id ?? null,
    }).then((res) => {
      if (cancelled) return;
      if (res.cpUserNo) setLockedUserNo(String(res.cpUserNo));
      if (!res.clientId) return; // unknown userNo → manual selection/creation
      setLinkedClientId(res.clientId);
      setLinkedClientName(res.clientName || '');
      setClientAutoMatched(true);
      setAutoMatchVia('userno');
      setShowClientDropdown(false);
      setUserNoLocked(true);
      const matched = allClientsRef.current.find(c => c.id === res.clientId);
      if (matched) {
        const isApprovedClient = String(matched.buyer_approval_status || '').toUpperCase() === 'APPROVED';
        if (!contactNumber && matched.phone) setContactNumber(matched.phone);
        if (!clientState && matched.state && isApprovedClient) {
          const normalizedState = normalizeIndianState(matched.state);
          if (normalizedState) setClientState(normalizedState);
        }
      }
    }).finally(() => {
      if (!cancelled) setUserNoResolving(false);
    });
    return () => { cancelled = true; };
  }, [open, od?.order_number, syncRecord?.binance_order_number]);



  // Pre-fill from counterparty contact records (terminal-captured data = highest priority)
  useEffect(() => {
    if (!open) return;
    const nickname = (syncRecord?.order_data?.counterparty_nickname || syncRecord?.counterparty_name || '').trim();
    if (!nickname || nickname.includes('*')) return;

    supabase.from('counterparty_contact_records')
      .select('contact_number, state')
      .eq('counterparty_nickname', nickname)
      .maybeSingle()
      .then(({ data }) => {
        const phone = data?.contact_number || '';
        const state = normalizeIndianState(data?.state);
        setCounterpartyPhone(phone);
        setCounterpartyState(state);
        // Terminal-captured data has highest priority — unconditionally set
        if (phone) setContactNumber(phone);
        if (state) setClientState(state);
      });
  }, [open, syncRecord]);

  // Track client master data for conflict detection AND auto-fill empty form fields
  useEffect(() => {
    if (!linkedClientId) { setClientMasterPhone(''); setClientMasterState(''); return; }
    const client = allClients.find(c => c.id === linkedClientId);
    const masterPhone = client?.phone || '';
    const masterState = normalizeIndianState(client?.state);
    setClientMasterPhone(masterPhone);
    setClientMasterState(masterState);
    // Auto-fill form fields from client master if empty or non-standard (not in state list)
    if (masterPhone) setContactNumber(prev => (hasTextValue(prev) ? prev : masterPhone));
    if (masterState) {
      setClientState(prev => {
        const normalizedPrev = normalizeIndianState(prev);
        return normalizedPrev || masterState;
      });
    }
  }, [linkedClientId, allClients]);

  // Build conflict items
  const salesConflicts = useMemo(() => {
    const items: { field: string; clientValue: string; counterpartyValue: string; onChoose: (v: string) => void }[] = [];
    if (clientMasterPhone && counterpartyPhone && clientMasterPhone !== counterpartyPhone) {
      items.push({ field: 'Phone', clientValue: clientMasterPhone, counterpartyValue: counterpartyPhone, onChoose: setContactNumber });
    }
    if (clientMasterState && counterpartyState && clientMasterState !== counterpartyState) {
      items.push({ field: 'State', clientValue: clientMasterState, counterpartyValue: counterpartyState, onChoose: setClientState });
    }
    return items;
  }, [clientMasterPhone, counterpartyPhone, clientMasterState, counterpartyState]);

  // Helper: lookup contact records by nickname(s) and pre-fill
  // Terminal-captured data has highest priority per form-autofill-precedence-rules
  const lookupContact = async (nicknames: string[]) => {
    // Filter out masked nicknames (containing *) to prevent cross-contamination
    const unique = [...new Set(nicknames.filter(n => !!n && !n.includes('*')))];
    if (unique.length === 0) return;

    const { data: exactRecords } = await supabase
      .from('counterparty_contact_records')
      .select('contact_number, state')
      .in('counterparty_nickname', unique);
    const exactFound = (exactRecords || []).find(r => r.contact_number || r.state);
    if (exactFound?.contact_number) {
      setCounterpartyPhone(exactFound.contact_number);
      // Terminal data = highest priority — unconditionally set
      setContactNumber(exactFound.contact_number);
    }
    const normalizedState = normalizeIndianState(exactFound?.state);
    if (normalizedState) {
      setCounterpartyState(normalizedState);
      setClientState(normalizedState);
    }
  };

  // Reset state and fetch verified name when dialog opens or when record changes
  const syncRecordId = syncRecord?.id;
  useEffect(() => {
    const currentSync = syncRecord;
    const orderData = currentSync?.order_data || {};
    const currentLinkedClientId = currentSync?.client_id || '';
    const linkedClientFromCache = currentLinkedClientId
      ? allClients.find(c => c.id === currentLinkedClientId)
      : null;

    const normalizedSyncState = normalizeIndianState(currentSync?.state);
    const normalizedLinkedClientState = normalizeIndianState(linkedClientFromCache?.state);

    setLinkedClientId(currentLinkedClientId);
    setLinkedClientName(linkedClientFromCache?.name || '');
    // Pre-fill from sync record's stored terminal data (captured during order flow)
    // IMPORTANT: fall back to linked client master when sync values are blank.
    // This prevents the reset effect from wiping already-known client data.
    setContactNumber((currentSync?.contact_number || linkedClientFromCache?.phone || '').trim());
    setClientState(normalizedSyncState || normalizedLinkedClientState);
    setEnrichedName(null);
    setClientAutoMatched(false);
    setShowClientDropdown(false);

    if (!open || !currentSync) return;

    const maskedNickname = orderData.counterparty_nickname || currentSync.counterparty_name;
    const orderNumber = orderData.order_number || currentSync.binance_order_number;
    const hasVerifiedName = !!orderData.verified_name;
    

    if (orderNumber) {
      supabase.functions.invoke('binance-ads', {
        body: { action: 'getOrderDetail', orderNumber },
      }).then(({ data }) => {
        const detail = data?.data;
        const buyerRealName = detail?.buyerRealName || detail?.buyerName || null;
        // Binance API returns buyerNickName (capital N) — handle both casings
        const buyerNickname = detail?.buyerNickName || detail?.buyerNickname || null;

        if (!hasVerifiedName && buyerRealName) {
          setEnrichedName(buyerRealName);
          supabase
            .from('terminal_sales_sync')
            .update({
              counterparty_name: buyerRealName,
              order_data: { ...orderData, verified_name: buyerRealName },
            })
            .eq('id', currentSync.id)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['terminal_sales_sync'] });
            });
        }

        // Always lookup contact records — contact may have been captured AFTER sync
        lookupContact([buyerNickname, maskedNickname, buyerRealName].filter(Boolean) as string[]);
      }).catch(() => {
        if (maskedNickname) {
          lookupContact([maskedNickname]);
        }
      });
    } else if (maskedNickname) {
      lookupContact([maskedNickname]);
    }
  }, [open, syncRecordId]);

  // Fetch sales payment methods
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`*, bank_accounts:bank_account_id(account_name, bank_name)`)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).filter((method: any) => !isAdjustmentBank(method.bank_accounts?.account_name));
    },
  });

  // No longer need separate bank accounts query for split - using paymentMethods instead

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  // Resolve the product from the actual traded asset on this order (falls back to USDT).
  const usdtProduct = useMemo(() => {
    const asset = String(od.asset || 'USDT').toUpperCase();
    const match = (code: string) =>
      products.find((p: any) =>
        String(p.code || '').toUpperCase() === code ||
        String(p.name || '').toUpperCase() === code ||
        String(p.name || '').toUpperCase().includes(code)
      );
    return match(asset) || match('USDT') || null;
  }, [products, od.asset]);


  const totalAmount = parseFloat(od.total_price) || 0;
  const quantity = parseFloat(od.amount) || 0;
  const unitPrice = parseFloat(od.unit_price) || 0;
  const commission = parseFloat(od.commission) || 0;

  // Split payment allocation calculation
  const splitAllocation = useMemo(() => {
    const totalAllocated = paymentSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const remaining = totalAmount - totalAllocated;
    const isValid = Math.abs(remaining) <= 0.01 && paymentSplits.every(s => s.payment_method_id && parseFloat(s.amount) > 0);
    return { totalAllocated, remaining, isValid };
  }, [paymentSplits, totalAmount]);

  const addPaymentSplit = () => {
    setPaymentSplits(prev => [...prev, { payment_method_id: '', amount: '' }]);
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

  // Auto-fill first split amount
  useEffect(() => {
    if (isMultiplePayments && paymentSplits.length === 1 && totalAmount > 0) {
      const currentAmount = parseFloat(paymentSplits[0].amount) || 0;
      if (currentAmount === 0) {
        setPaymentSplits([{ ...paymentSplits[0], amount: totalAmount.toFixed(2) }]);
      }
    }
  }, [isMultiplePayments, totalAmount]);

  // Handle client selection from dropdown
  const handleClientSelect = (client: any) => {
    manualSelectionRef.current = true;
    setLinkedClientId(client.id);
    setLinkedClientName(client.name);
    setShowClientDropdown(false);
    setClientAutoMatched(true);
    // Auto-populate contact ONLY if the client actually has a phone number in their record
    // Auto-populate state ONLY if the client actually has a state saved AND is APPROVED
    // Never infer or cross-populate from other sources
    if (client.phone && !contactNumber) setContactNumber(client.phone);
    const normalizedClientState = normalizeIndianState(client.state);
    if (normalizedClientState && String(client.buyer_approval_status || '').toUpperCase() === 'APPROVED') {
      setClientState(normalizedClientState);
    } else if (!normalizedClientState) {
      setClientState(''); // Clear state if client has none
    }
    toast({ title: "Client Linked", description: `${client.name} selected as buyer client` });
  };

  // Clear linked client (to allow re-selection or new creation)
  const handleUnlinkClient = () => {
    if (userNoLocked) {
      toast({
        title: "Locked by Binance User No",
        description: "This client is locked via the counterparty's Binance account identity and cannot be changed.",
        variant: "destructive",
      });
      return;
    }
    manualSelectionRef.current = true;
    setLinkedClientId('');
    setLinkedClientName('');
    setClientAutoMatched(false);
    setShowClientDropdown(true);
  };


  // Create buyer client mutation
  const createClientMutation = useMutation({
    mutationFn: async () => {
      // Block client creation with masked nicknames or unknown names
      if (!displayName || displayName === '—' || displayName === 'Unknown' || displayName.includes('*')) {
        throw new Error('Cannot create client with a masked or unknown name. Please resolve the verified name first.');
      }
      const unmaskedNick = (od?.counterparty_nickname_unmasked
        || (od?.counterparty_nickname && !String(od.counterparty_nickname).includes('*') ? od.counterparty_nickname : null)) as string | null;
      const clientData = await createBuyerClient(
        displayName,
        contactNumber || undefined,
        clientState || undefined,
        {
          binanceNickname: unmaskedNick,
          verifiedName: sanitizeVerifiedName(od?.verified_name || enrichedName),
          cpUserNo: lockedUserNo,
        },
      );
      if (!clientData?.id) {
        throw new Error('Failed to create buyer client. Please try selecting an existing client or verify the buyer name.');
      }
      return clientData;
    },
    onSuccess: (client: any) => {
      setLinkedClientId(client.id);
      setLinkedClientName(displayName);
      setClientAutoMatched(true);
      setShowClientDropdown(false);
      toast({ title: "Client Created", description: `${displayName} added as buyer client` });
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

      // Hard gate: never approve while resolution is still in flight.
      if (userNoResolving) {
        throw new Error("Still inferring the Binance User No for this order — please wait.");
      }
      // userNo is the mandatory identity anchor. No order may be approved until
      // its Binance User No has been inferred — there is NO manual override.
      if (!lockedUserNo) {
        throw new Error("Binance User No could not be inferred for this order. Approval is blocked until it resolves.");
      }



      if (isMultiplePayments) {
        if (!splitAllocation.isValid) {
          throw new Error(`Payment allocation mismatch. Remaining: ₹${splitAllocation.remaining.toFixed(2)} (must be ₹0.00)`);
        }
        const methodIds = paymentSplits.map(s => s.payment_method_id);
        if (new Set(methodIds).size !== methodIds.length) {
          throw new Error("Duplicate payment methods in split payment");
        }
      } else {
        if (!paymentMethodId) {
          throw new Error("Please select a payment method");
        }
      }

      const selectedMethod = isMultiplePayments ? null : paymentMethods.find((m: any) => m.id === paymentMethodId);
      const isGateway = isMultiplePayments ? false : Boolean(selectedMethod?.payment_gateway);

      // Use the FULL Binance order number — truncating to the last 12 digits caused
      // real collisions (e.g. 22919013709802323968 vs 22920798709802323968 both end
      // in 709802323968) and surfaced as a false "Duplicate Entry" on approval.
      const orderNumber = `SO-TRM-${od.order_number || syncRecord.binance_order_number || Date.now()}`;
      // Convert Binance create_time to IST date string to avoid UTC date truncation
      // (e.g., Mar 9 01:55 IST = Mar 8 20:25 UTC → stored as Mar 8 if using UTC)
      const orderDate = od.create_time
        ? (() => {
            const d = new Date(od.create_time);
            // Format in Asia/Kolkata timezone as YYYY-MM-DD
            const istDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA gives YYYY-MM-DD
            return istDate;
          })()
        : new Date(settlementDate).toISOString().slice(0, 10);

      // Fetch CoinUSDT market rate at approval time
      const asset = (od.asset || 'USDT').toUpperCase();
      const locked = await fetchAndLockMarketRate(asset, { entryType: 'sales_approval' });
      const marketRateUsdt = locked.price;

      const tsEffRate = marketRateUsdt > 0 ? marketRateUsdt : 1;
      const tsEffUsdtQty = quantity * tsEffRate;
      const tsEffUsdtRate = tsEffUsdtQty > 0 ? totalAmount / tsEffUsdtQty : null;

      // The order, the wallet debit, the fee row, the split postings and the approval mark are saved
      // by ONE database call (create_sales_order_with_postings): all of it is saved or none of it, so a
      // failed approval leaves nothing behind and can simply be approved again. The rows are the same
      // ones this dialog used to write itself, in the same order.
      const order = {
        order_number: orderNumber,
        // Link by the resolved client (Binance userNo), never by name — names collide.
        client_id: linkedClientId || null,
        client_name: displayName,
        client_phone: (contactNumber && !await isPhoneBlocked(contactNumber)) ? contactNumber : null,
        client_state: clientState || null,
        order_date: orderDate,
        total_amount: totalAmount,
        quantity: quantity,
        price_per_unit: unitPrice,
        product_id: usdtProduct?.id || null,
        wallet_id: od.wallet_id || null,
        platform: od.wallet_name || 'Binance',
        fee_percentage: 0,
        fee_amount: commission,
        net_amount: totalAmount,
        sales_payment_method_id: isMultiplePayments ? null : paymentMethodId,
        is_split_payment: isMultiplePayments,
        payment_status: 'COMPLETED',
        status: 'COMPLETED',
        settlement_status: isMultiplePayments ? 'DIRECT' : (isGateway ? 'PENDING' : 'DIRECT'),
        is_off_market: false,
        description: `Terminal P2P Sale - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
        created_by: userId,
        source: 'terminal',
        terminal_sync_id: syncRecord.id,
        market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
        effective_usdt_qty: tsEffUsdtQty,
        effective_usdt_rate: tsEffUsdtRate,
      };
      const steps: any[] = [];

      // Binance SELL wallet impact = sold quantity + commission (commission is a separate crypto expense).
      // Post the full physical deduction in one wallet debit to prevent recurring drift.
      if (od.wallet_id && quantity > 0) {
        const assetCode = (od.asset || 'USDT').toUpperCase();
        const totalWalletDebit = quantity + Math.max(commission, 0);

        steps.push({ op: 'wallet_deduction', wallet_id: od.wallet_id, amount: totalWalletDebit, asset_code: assetCode });

        // Keep fee analytics/reporting without creating a second wallet DEBIT row.
        if (commission > 0) {
          const { data: usdtProd } = await supabase
            .from('products')
            .select('average_buying_price')
            .eq('code', 'USDT')
            .single();
          const avgBuyPrice = Number(usdtProd?.average_buying_price || 0);

          steps.push({
            op: 'insert',
            table: 'wallet_fee_deductions',
            order_id_column: 'order_id',
            row: {
              wallet_id: od.wallet_id,
              order_type: 'SALES',
              order_number: orderNumber,
              gross_amount: totalAmount,
              fee_percentage: 0,
              fee_amount: commission,
              net_amount: totalAmount,
              fee_usdt_amount: commission,
              usdt_rate_used: 0,
              average_buying_price: avgBuyPrice,
              fee_inr_value_at_buying_price: commission * avgBuyPrice,
              market_rate_usdt_snapshot: marketRateUsdt > 0 ? marketRateUsdt : null,
              price_fetched_at: new Date().toISOString(),
            },
          });
        }
      }

      // Payment method usage is computed live — no manual current_usage update needed

      // Handle split payment bank credits
      if (isMultiplePayments) {
        let hasAnyGateway = false;
        for (const split of paymentSplits) {
          const splitAmount = parseFloat(split.amount);
          if (splitAmount <= 0 || !split.payment_method_id) continue;

          // Resolve bank_account_id from payment method
          const pm = paymentMethods.find((m: any) => m.id === split.payment_method_id);
          const resolvedBankAccountId = pm?.bank_account_id;
          if (!resolvedBankAccountId) continue;

          const splitIsGateway = Boolean(pm?.payment_gateway);

          if (splitIsGateway) {
            // Gateway/POS split → create pending settlement, NOT a direct INCOME entry
            hasAnyGateway = true;
            steps.push({
              op: 'insert',
              table: 'pending_settlements',
              order_id_column: 'sales_order_id',
              row: {
                order_number: orderNumber,
                client_name: displayName,
                total_amount: splitAmount,
                settlement_amount: splitAmount,
                order_date: orderDate,
                payment_method_id: split.payment_method_id,
                bank_account_id: resolvedBankAccountId,
                settlement_cycle: pm?.settlement_cycle || 'T+1 Day',
                settlement_days: pm?.settlement_days || null,
                expected_settlement_date: pm?.settlement_days
                  ? new Date(new Date(orderDate).getTime() + (pm.settlement_days * 86400000)).toISOString().split('T')[0]
                  : new Date(new Date(orderDate).getTime() + 86400000).toISOString().split('T')[0],
                status: 'PENDING',
              },
            });
          } else {
            // Direct bank split → create INCOME bank transaction
            steps.push({
              op: 'insert',
              table: 'bank_transactions',
              row: {
                bank_account_id: resolvedBankAccountId,
                transaction_type: 'INCOME',
                amount: splitAmount,
                transaction_date: orderDate,
                description: `Sales Order - ${orderNumber} - ${displayName} (Split)`,
                reference_number: orderNumber,
                category: 'Sales',
                related_account_name: displayName,
                created_by: userId,
              },
            });
          }

          // Record split in sales_order_payment_splits
          steps.push({
            op: 'insert',
            table: 'sales_order_payment_splits',
            order_id_column: 'sales_order_id',
            row: {
              bank_account_id: resolvedBankAccountId,
              amount: splitAmount,
              payment_method_id: split.payment_method_id,
              is_gateway: splitIsGateway,
              created_by: userId,
            },
          });
        }

        // If any gateway split exists, set settlement_status to PENDING
        if (hasAnyGateway) {
          steps.push({ op: 'update_order', set: { settlement_status: 'PENDING' } });
        }

        // Guarantee one pending settlement per gateway split
        steps.push({ op: 'sync_split_settlements' });
      }

      // Save it all and mark the sync record approved (the call refuses a record that is no longer pending).
      const { data: created, error: createErr } = await supabase.rpc('create_sales_order_with_postings' as any, {
        p_order: order,
        p_steps: steps,
        p_source: {
          table: 'terminal_sales_sync',
          id: syncRecord.id,
          set: {
            client_id: linkedClientId || null,
            contact_number: contactNumber || null,
            state: clientState || null,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          },
        },
      });
      if (createErr) throw Object.assign(createErr, { fromApprovalCall: true });
      const salesOrder = { id: (created as unknown as { sales_order_id: string }).sales_order_id };

      // The sale is saved. Nothing below is money or stock: a failure here must not show an error (that makes
      // people approve again), so it is collected and shown as a warning with the success message.
      const notSaved: string[] = [];
      const saveExtra = async (label: string, save: () => PromiseLike<{ error?: unknown } | void>) => {
        try {
          const result = await save();
          if (result && result.error) notSaved.push(label);
        } catch {
          notSaved.push(label);
        }
      };

      // Update counterparty contact records — only when we have a real (unmasked) nickname.
      // Masked values like "Sa***" are useless as identity keys and cause cross-contamination.
      const contactNick = sanitizeNickname(od.counterparty_nickname_unmasked)
        || sanitizeNickname(od.counterparty_nickname)
        || sanitizeNickname(syncRecord.counterparty_name);
      if (contactNick && (contactNumber || clientState)) {
        await saveExtra('the Terminal contact record', () => supabase
          .from('counterparty_contact_records')
          .upsert({
            counterparty_nickname: contactNick,
            contact_number: contactNumber || null,
            state: clientState || null,
            collected_by: userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'counterparty_nickname' }));
      }

      // Sync contact/state to client master — overwrite if operator provides different values
      if (linkedClientId && (contactNumber || clientState)) {
        await saveExtra("the client's phone and state", async () => {
          const { data: existingClient } = await supabase
            .from('clients')
            .select('phone, state')
            .eq('id', linkedClientId)
            .maybeSingle();

          const updates: any = {};
          if (contactNumber && existingClient?.phone !== contactNumber) {
            updates.phone = contactNumber;
          }
          if (clientState && existingClient?.state !== clientState) {
            updates.state = clientState;
          }
          if (Object.keys(updates).length > 0) {
            return await supabase.from('clients').update(updates).eq('id', linkedClientId);
          }
        });
      }

      // Persist the Binance userNo → client link (the only identity anchor).
      if (linkedClientId && lockedUserNo) {
        await saveExtra('the Binance User No link', () => linkClientUserNo(linkedClientId, lockedUserNo, 'approval'));
      }

      // If client is newly created (buyer_approval_status = PENDING), create onboarding approval
      if (linkedClientId) {
        await saveExtra('the buyer approval request', async () => {
          const { data: clientRecord } = await supabase
            .from('clients')
            .select('buyer_approval_status, name, phone, state')
            .eq('id', linkedClientId)
            .maybeSingle();

          if (clientRecord && clientRecord.buyer_approval_status === 'PENDING') {
            // Check no approval record already exists for this sales order
            const { data: existingApproval } = await supabase
              .from('client_onboarding_approvals')
              .select('id')
              .eq('sales_order_id', salesOrder.id)
              .maybeSingle();

            if (!existingApproval) {
              const inserted = await supabase.from('client_onboarding_approvals').insert({
                sales_order_id: salesOrder.id,
                client_name: clientRecord.name || displayName,
                client_phone: (clientRecord.phone && !await isPhoneBlocked(clientRecord.phone)) ? clientRecord.phone : ((contactNumber && !await isPhoneBlocked(contactNumber)) ? contactNumber : null),
                resolved_client_id: linkedClientId,
                cp_userno: lockedUserNo || null,
                binance_nickname: sanitizeNickname(od.counterparty_nickname_unmasked || od.counterparty_nickname) || null,
                // Pass state only if operator manually entered it in the dialog.
                // If left blank (null), Buyer Approval officer will enter it during review.
                client_state: clientState || null,
                order_amount: totalAmount,
                order_date: orderDate,
                approval_status: 'PENDING',
              });
              // A pending request for this client, User No or order already exists (unique index): nothing is missing.
              if (inserted.error?.code === '23505') return;
              return inserted;
            }
          }
        });
      }

      return { notSaved };
    }, // end mutationFn
    onSuccess: ({ notSaved }) => {
      if (notSaved.length > 0) {
        toast({
          title: "Sales Order Approved",
          description: `The sales order was created, but ${joinLabels(notSaved)} did not save. Check the client record.`,
          variant: "warning",
        });
      } else {
        toast({ title: "Sales Order Approved", description: "Terminal sell order has been approved and sales order created" });
      }
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stock'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      onSuccess();
    },
    onError: (err: Error) => {
      const { title, description } = parseApprovalError(err, 'Sales');
      toast({ title, description: withNothingSaved(err, description), variant: "destructive" });
    },
  });

  const orderTimeLabel = od.create_time ? fmtDateTime(od.create_time) : '—';

  // Get the selected client object for hover preview
  const selectedClient = useMemo(() => {
    if (!linkedClientId) return null;
    return allClients.find(c => c.id === linkedClientId) || null;
  }, [linkedClientId, allClients]);

  /* ── Presentation only: everything below is derived from the state above ── */
  const assetLabel = od.asset || 'USDT';
  const account = cachedExchangeAccount(queryClient, syncRecord?.exchange_account_id ?? od?.exchange_account_id ?? null);
  const normalizedDisplayName = displayName.trim().toLowerCase();
  const isExactMatch = (client: any) => client.name.trim().toLowerCase() === normalizedDisplayName;
  // Phones captured on the Terminal for this order (never the picked client's own phone).
  const terminalPhones = [syncRecord?.contact_number, counterpartyPhone].map(phoneDigits).filter(Boolean);
  const matchesTerminalPhone = (phone?: string | null) => {
    const p = phoneDigits(phone);
    return !!p && terminalPhones.includes(p);
  };
  const selectedMethodRow: any = isMultiplePayments ? null : paymentMethods.find((m: any) => m.id === paymentMethodId);
  const hasDuplicateSplitMethods = isMultiplePayments && new Set(paymentSplits.map((s) => s.payment_method_id)).size !== paymentSplits.length;
  // Why Approve is disabled (same order as its disabled condition), or what would stop the approval.
  const footNote = approveMutation.isPending
    ? null
    : userNoResolving
      ? 'Inferring Binance User No…'
      : !lockedUserNo
        ? 'Blocked until the Binance User No is inferred'
        : isMultiplePayments
          ? !splitAllocation.isValid
            ? splitNote(splitAllocation.remaining)
            : hasDuplicateSplitMethods
              ? 'Use a different payment method on every row'
              : null
          : !paymentMethodId
            ? 'Select a payment method to approve'
            : null;

  const createClientButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={() => createClientMutation.mutate()}
      disabled={createClientMutation.isPending}
    >
      {createClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      {createClientMutation.isPending ? 'Creating client…' : 'Create buyer client'}
    </Button>
  );

  // A User No lock replaces the "Change client" button (the lock chip sits with the other chips).
  const lockChip = userNoLocked && (
    <Chip tone="info" title={`Locked via Binance User No${lockedUserNo ? ` (${lockedUserNo})` : ''}`}>
      <Lock className="h-3 w-3" aria-hidden />
      User No locked
    </Chip>
  );
  const changeButton = !userNoLocked && (
    <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 self-center" onClick={handleUnlinkClient}>
      Change client
    </Button>
  );

  const previewContentProps = {
    side: (isMobile ? 'bottom' : 'right') as 'bottom' | 'right',
    align: (isMobile ? 'center' : 'start') as 'center' | 'start',
    collisionPadding: 12,
    avoidCollisions: true,
    className: 'w-[calc(100vw-24px)] max-w-80 p-3 z-[9999] bg-popover border border-border shadow-sm',
    sideOffset: 8,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={dialogContentClass('xl', 'focus:outline-none')}
        // Start focus on the dialog itself, not its first button: /erp-entry opens this dialog from an
        // Enter keydown, and the same key press would otherwise activate that button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHead
          icon={Link2}
          title="Approve terminal sale"
          description="Check the client and payment, then create the ERP sales order."
          meta={
            <>
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="text-xs text-muted-foreground">Binance order</span>
                <OrderNo value={od.order_number} className="truncate" />
                <CopyButton value={od.order_number} label="Copy order number" />
              </span>
              {account && <AccountChip account={account} />}
            </>
          }
        />

        <DialogBody>
          {/* Read-only Binance order data */}
          <Section title={sectionHeading('Binance order')} boxed>
            <Facts
              cols={3}
              className="grid-cols-2"
              items={[
                { label: 'Total amount', value: <span className="text-lg font-semibold leading-6 tabular-nums">{fmtInr(totalAmount)}</span> },
                { label: 'Quantity sold', value: <span className="tabular-nums">{fmtAssetQty(od.amount || 0, assetLabel)}</span> },
                { label: 'Price per unit', value: <span className="tabular-nums">{fmtRate(od.unit_price || 0)}</span> },
                { label: 'Buyer', value: displayName },
                { label: 'Paid via', value: od.pay_method || '—' },
                { label: 'Fee', value: <span className="tabular-nums">{fmtAssetQty(od.commission || 0, assetLabel)}</span> },
                { label: 'Wallet', value: od.wallet_name || '—' },
                { label: 'Order time', value: orderTimeLabel },
              ]}
            />
          </Section>

          {/* Client mapping */}
          <Section
            title={sectionHeading('Client')}
            actions={
              (userNoResolving || (matchingClients.length > 0 && !linkedClientId)) && (
                <>
                  {userNoResolving && (
                    <Chip tone="neutral">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      Checking User No
                    </Chip>
                  )}
                  {matchingClients.length > 0 && !linkedClientId && (
                    <Chip tone="neutral">
                      {matchingClients.length} match{matchingClients.length > 1 ? 'es' : ''} found
                    </Chip>
                  )}
                </>
              )
            }
            bodyClassName="space-y-3"
          >
            {!userNoResolving && !lockedUserNo && (
              <Callout tone="danger" icon={AlertCircle} title="Binance User No not inferred">
                It could not be inferred for this order (proxy issue, rate limit, or an order older than Binance's
                identity window). Approval is blocked until it resolves. Close and reopen this dialog to try again.
              </Callout>
            )}

            {linkedClientId && selectedClient ? (
              <>
                <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden>
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <HoverCard openDelay={300} closeDelay={100} open={hoveredClientId === selectedClient.id} onOpenChange={(isOpen) => {
                        setHoveredClientId(isOpen ? selectedClient.id : null);
                      }}>
                        <HoverCardTrigger asChild>
                          <span
                            className="min-w-0 cursor-pointer select-none truncate text-sm font-semibold text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-foreground"
                            onTouchStart={() => startClientPreviewPress(selectedClient.id)}
                            onTouchEnd={cancelClientPreviewPress}
                            onTouchMove={cancelClientPreviewPress}
                            onTouchCancel={cancelClientPreviewPress}
                          >
                            {selectedClient.name}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent {...previewContentProps}>
                          <ClientOrderPreview
                            clientId={selectedClient.id}
                            clientName={selectedClient.name}
                            clientData={{
                              client_id: selectedClient.client_id,
                              phone: selectedClient.phone,
                              date_of_onboarding: selectedClient.date_of_onboarding,
                              client_type: selectedClient.client_type,
                              is_buyer: selectedClient.is_buyer,
                              is_seller: selectedClient.is_seller,
                            }}
                            isOpen={hoveredClientId === selectedClient.id}
                          />
                        </HoverCardContent>
                      </HoverCard>
                      <Chip tone="success">Linked</Chip>
                      {clientAutoMatched && autoMatchVia === 'userno' && (
                        <Chip tone="neutral" title="Auto-linked by Binance userNo">Auto-linked</Chip>
                      )}
                      {lockChip}
                    </div>
                    <ClientMeta client={selectedClient} />
                  </div>
                  {changeButton}
                </div>

                {selectedClient.buyer_approval_status === 'PENDING' && (
                  <Callout tone="warning" icon={AlertCircle} title="New client – buyer approval pending">
                    This client will appear in the Buyer Approvals queue after this sale is approved.
                  </Callout>
                )}
              </>
            ) : linkedClientId && !selectedClient ? (
              // Client ID exists but is not in the clients list yet (still loading, or just created)
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">{linkedClientName || displayName}</span>
                  <Chip tone="success">Linked</Chip>
                  {lockChip}
                </div>
                {changeButton}
              </div>
            ) : matchingClients.length > 0 ? (
              <>
                {matchingClients.filter(c => c.name.trim().toLowerCase() === displayName.trim().toLowerCase()).length > 1 && (
                  <Callout tone="warning" icon={Users} title="Multiple clients have exactly this name">
                    Compare the phone and state on each row with the buyer's details, then link the right one.
                  </Callout>
                )}
                <p className="text-[13px] text-muted-foreground">
                  Matching clients found for "<span className="font-medium text-foreground">{displayName}</span>". Pick the right one
                  — hover or long-press a row to see that client's recent orders.
                </p>
                <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card" role="group" aria-label="Matching clients">
                  {matchingClients.map((client) => (
                    <HoverCard key={client.id} openDelay={300} closeDelay={100} open={hoveredClientId === client.id} onOpenChange={(isOpen) => {
                      setHoveredClientId(isOpen ? client.id : null);
                    }}>
                      {/* Keyboard focus must not open the preview (it loads order history); hover and long-press still do. */}
                      <HoverCardTrigger asChild onFocus={(e) => e.preventDefault()}>
                        <button
                          type="button"
                          className="flex w-full select-none items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          aria-label={`Link ${client.name}, ${isExactMatch(client) ? 'exact' : 'partial'} match${matchesTerminalPhone(client.phone) ? ', phone matches' : ''}${client.client_id ? `, ${client.client_id}` : ''}${client.phone ? `, ${client.phone}` : ''}${client.state ? `, ${client.state}` : ''}`}
                          onClick={() => {
                            if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                            handleClientSelect(client);
                          }}
                          onTouchStart={() => startClientPreviewPress(client.id)}
                          onTouchEnd={cancelClientPreviewPress}
                          onTouchMove={cancelClientPreviewPress}
                          onTouchCancel={cancelClientPreviewPress}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="min-w-0 truncate text-sm font-medium text-foreground">{client.name}</span>
                              {isExactMatch(client) ? <Chip tone="success">Exact</Chip> : <Chip tone="neutral">Partial</Chip>}
                              {matchesTerminalPhone(client.phone) && (
                                <Chip tone="success" title="Same phone as the one captured on the Terminal for this order">Phone matches</Chip>
                              )}
                            </span>
                            <ClientMeta client={client} />
                          </span>
                          <span className="shrink-0 text-xs font-medium text-primary" aria-hidden>Link</span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent {...previewContentProps}>
                        <ClientOrderPreview
                          clientId={client.id}
                          clientName={client.name}
                          clientData={{
                            client_id: client.client_id,
                            phone: client.phone,
                            date_of_onboarding: client.date_of_onboarding,
                            client_type: client.client_type,
                            is_buyer: client.is_buyer,
                            is_seller: client.is_seller,
                          }}
                          isOpen={hoveredClientId === client.id}
                        />
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground">None of these?</span>
                  {createClientButton}
                </div>
              </>
            ) : (
              <Callout
                tone="neutral"
                icon={AlertCircle}
                title={displayName === '—' ? 'Buyer name not verified yet' : `No matching client found for "${displayName}"`}
              >
                <p>
                  {displayName === '—'
                    ? "Binance hasn't returned the buyer's verified name, so a client can't be matched or created yet."
                    : 'Create a buyer client from this order. New clients go to Buyer Approvals after the sale is approved.'}
                </p>
                <div className="mt-2">{createClientButton}</div>
              </Callout>
            )}

            {salesConflicts.length > 0 && (
              <Callout tone="warning" icon={AlertTriangle} title="Data conflict — choose which value to keep">
                <p>The client record and the Terminal disagree. The value you pick fills the form below and is saved with this sale.</p>
                <div className="mt-2 space-y-1.5">
                  {salesConflicts.map((c) => {
                    const current = c.field === 'Phone' ? contactNumber : clientState;
                    return (
                      <div key={c.field} className="flex flex-wrap items-center gap-2">
                        <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">{c.field}</span>
                        <ConflictOption source="Client" value={c.clientValue} active={current === c.clientValue} onClick={() => c.onChoose(c.clientValue)} />
                        <ConflictOption source="Terminal" value={c.counterpartyValue} active={current === c.counterpartyValue} onClick={() => c.onChoose(c.counterpartyValue)} />
                      </div>
                    );
                  })}
                </div>
              </Callout>
            )}
          </Section>

          {/* Payment */}
          <Section title={sectionHeading('Payment')} bodyClassName="space-y-3">
            <FieldGrid>
              <Field
                label="Payment method"
                htmlFor={isMultiplePayments ? undefined : 'tsa-payment-method'}
                hint={selectedMethodRow ? settlementLine(selectedMethodRow) : undefined}
                aside={
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="split-sales-payment"
                      checked={isMultiplePayments}
                      onCheckedChange={(checked) => {
                        setIsMultiplePayments(!!checked);
                        if (checked) {
                           setPaymentSplits([{ payment_method_id: '', amount: totalAmount > 0 ? totalAmount.toFixed(2) : '' }]);
                        } else {
                           setPaymentSplits([{ payment_method_id: '', amount: '' }]);
                        }
                      }}
                    />
                    <Label htmlFor="split-sales-payment" className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground">
                      Split payment
                    </Label>
                  </div>
                }
              >
                {!isMultiplePayments ? (
                  <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                    <SelectTrigger id="tsa-payment-method" className="h-9 text-left text-sm">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border z-50 max-h-[250px]">
                      {paymentMethods.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nickname || `${m.type}${m.bank_accounts ? ` - ${m.bank_accounts.account_name}` : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground">
                    Split across the methods below
                  </div>
                )}
              </Field>

              <Field label="Order date & time (UTC)" htmlFor="tsa-order-time" hint="Actual Binance order time (not editable)">
                <Input
                  id="tsa-order-time"
                  type="datetime-local"
                  value={settlementDate.slice(0, 16)}
                  disabled
                  className="h-9 text-sm bg-muted"
                />
              </Field>
            </FieldGrid>

            {isMultiplePayments && (
              <SplitEditor
                splits={paymentSplits}
                methods={paymentMethods}
                allocation={splitAllocation}
                totalAmount={totalAmount}
                methodLabel={splitMethodLabel}
                onChange={updatePaymentSplit}
                onAdd={addPaymentSplit}
                onRemove={removePaymentSplit}
              />
            )}
          </Section>

          {/* Contact & state */}
          <Section title={sectionHeading('Contact & state')} description="Saved with this sale and, when a client is linked, on the client record.">
            <FieldGrid>
              <Field label="Contact number" htmlFor="tsa-contact-number">
                <Input
                  id="tsa-contact-number"
                  inputMode="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="Buyer contact number"
                  className="h-9 text-sm"
                  maxLength={15}
                />
              </Field>
              <Field label="State" htmlFor="tsa-state">
                <Select value={clientState} onValueChange={setClientState}>
                  <SelectTrigger id="tsa-state" className="h-9 text-left text-sm">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border z-50 max-h-[260px]">
                    {INDIAN_STATES_AND_UTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>
          </Section>

          {/* Remarks */}
          <Section title={sectionHeading('Remarks')}>
            <Field label="Remarks" htmlFor="tsa-remarks" hint="Added to the sales order description." className="[&>div:first-child]:sr-only">
              <Textarea
                id="tsa-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional remarks..."
                className="min-h-[64px] text-sm"
                rows={2}
              />
            </Field>
          </Section>
        </DialogBody>

        <DialogFoot
          // On phones the note takes its own line above the buttons.
          className="[&>div:first-child]:basis-full sm:[&>div:first-child]:basis-auto"
          start={
            footNote && (
              <span className="inline-flex items-center gap-1.5">
                {userNoResolving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {footNote}
              </span>
            )
          }
        >
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending || userNoResolving || !lockedUserNo || (isMultiplePayments ? !splitAllocation.isValid : !paymentMethodId)}
          >
            {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {approveMutation.isPending ? 'Approving…' : 'Approve & create sale'}
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}

/* ── Approval messages (private to this dialog) ────────────────────────── */

/**
 * create_sales_order_with_postings saves everything or nothing. When the database answered with an error
 * (it carries a 5-character SQLSTATE code), nothing was saved: say so, unless the message already does.
 * A network error carries no code; then the outcome is unknown and the message is left as it is.
 */
function withNothingSaved(err: unknown, description: string): string {
  const e = err as { fromApprovalCall?: boolean; code?: unknown } | null;
  if (!e?.fromApprovalCall || !/^[0-9A-Z]{5}$/.test(String(e.code ?? ''))) return description;
  if (/nothing was saved/i.test(description)) return description;
  const text = description.trim();
  return `${text}${/[.!?]$/.test(text) ? '' : '.'} Nothing was saved.`;
}

/** "a", "a and b", "a, b and c" */
function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/* ── Presentation helpers (private to this dialog) ─────────────────────── */

/** Last 10 digits of a phone number, for a display-only comparison. */
function phoneDigits(value?: string | null): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

/** Rupees with exactly two decimals (split totals): ₹52,000.00 */
function inr2(value: number): string {
  const n = Number.isFinite(value) && Math.abs(value) >= 0.005 ? value : 0;
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Where the money from the chosen method lands. */
function settlementLine(method: any): string {
  const account = method?.bank_accounts?.account_name;
  if (method?.payment_gateway) {
    return `Gateway payment · settles to ${account || 'the linked bank account'}${method.settlement_cycle ? ` (${method.settlement_cycle})` : ''}`;
  }
  return account ? `Direct payment · credited to ${account}` : 'Direct payment';
}

/** Why an invalid split allocation can't be approved yet. */
function splitNote(remaining: number): string {
  if (Math.abs(remaining) > 0.01) return `Remaining ${inr2(remaining)} must be ₹0.00`;
  return 'Choose a payment method and an amount on every row';
}

/** Split row option: method name with its usage against the limit. */
function splitMethodLabel(method: any): string {
  const displayLabel = method.nickname
    ? method.nickname
    : method.type === 'UPI' && method.upi_id
      ? `${method.upi_id} (${method.risk_category})`
      : method.bank_accounts
        ? `${method.bank_accounts.account_name} (${method.risk_category})`
        : `${method.type} (${method.risk_category})`;
  return `${displayLabel} · ${fmtInr(method.current_usage)} / ${fmtInr(method.payment_limit)}`;
}

/** Client code · phone · state under a client name. */
function ClientMeta({ client }: { client: any }) {
  const parts: ReactNode[] = [];
  if (client.client_id) parts.push(<span key="code" className="font-mono text-[12px] text-foreground/80">{client.client_id}</span>);
  if (client.phone) parts.push(<span key="phone" className="font-mono text-[12px]">{client.phone}</span>);
  if (client.state) parts.push(<span key="state">{client.state}</span>);
  if (parts.length === 0) return null;
  return (
    <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          {part}
        </span>
      ))}
    </span>
  );
}

/** One side of a data conflict; pressed when the form currently holds this value. */
function ConflictOption({ source, value, active, onClick }: { source: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className={cn('h-8 gap-1.5 px-2.5 text-xs font-normal', active && 'border-primary bg-primary/10 hover:bg-primary/15')}
    >
      {active && <Check className="text-primary" aria-hidden />}
      <span className="text-muted-foreground">{source}:</span>{' '}
      <span className="font-mono text-[12px] text-foreground">{value}</span>
    </Button>
  );
}

/** Section heading text; sized here because a global mobile rule enlarges every h3 to 16px. */
function sectionHeading(text: string) {
  return <span className="text-[11px] leading-4">{text}</span>;
}

type ExchangeAccount = { id: string; account_name: string; color: string | null };

/**
 * The record's exchange account from the ["exchange-account-map"] cache that the Terminal sync /
 * ERP entry lists already filled. It never fetches: when the cache is empty, no chip is shown.
 */
function cachedExchangeAccount(queryClient: ReturnType<typeof useQueryClient>, accountId?: string | null): ExchangeAccount | null {
  if (!accountId) return null;
  const map = queryClient.getQueryData<Map<string, ExchangeAccount>>(['exchange-account-map']);
  return (map instanceof Map ? map.get(accountId) : undefined) ?? null;
}

/** Neutral exchange-account chip; the account's own colour only marks the dot (as in the purchase dialogs). */
function AccountChip({ account }: { account: ExchangeAccount }) {
  const label = account.account_name.replace(/\s*binance\s*$/i, '').trim() || account.account_name;
  return (
    <Chip tone="neutral" title={account.account_name} className="max-w-full">
      {account.color ? (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} />
      ) : (
        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </Chip>
  );
}

type SplitAllocation = { totalAllocated: number; remaining: number; isValid: boolean };

/** Split payment rows with the running total. All state stays in the dialog. */
function SplitEditor({
  splits,
  methods,
  allocation,
  totalAmount,
  methodLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  splits: PaymentSplit[];
  methods: any[];
  allocation: SplitAllocation;
  totalAmount: number;
  methodLabel: (method: any) => ReactNode;
  onChange: (index: number, field: keyof PaymentSplit, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-foreground">Payment distribution</p>
        {allocation.isValid ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Fully allocated
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            Not fully allocated
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="hidden gap-2 px-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)_2.25rem]">
          <span>Amount (₹)</span>
          <span>Payment method</span>
          <span className="sr-only">Remove</span>
        </div>
        {splits.map((split, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_2.25rem]">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={split.amount}
              onChange={(e) => onChange(index, 'amount', e.target.value)}
              placeholder="0.00"
              className="col-start-1 row-start-1 h-9 text-sm tabular-nums"
              aria-label={`Split ${index + 1} amount (₹)`}
            />
            <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <Select value={split.payment_method_id} onValueChange={(value) => onChange(index, 'payment_method_id', value)}>
                <SelectTrigger className="h-9 text-left text-sm" aria-label={`Split ${index + 1} payment method`}>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 border border-border shadow-sm">
                  {methods.map((method: any) => (
                    <SelectItem key={method.id} value={method.id}>
                      {methodLabel(method)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              disabled={splits.length === 1}
              className="col-start-2 row-start-1 h-9 w-9 text-muted-foreground hover:text-foreground sm:col-start-3"
              aria-label={`Remove split ${index + 1}`}
              title="Remove split"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="h-8 gap-1.5">
        <Plus className="h-4 w-4" />
        Add payment method
      </Button>

      <div>
        <SummaryRow label="Order total" value={inr2(totalAmount)} />
        <SummaryRow label="Allocated" value={inr2(allocation.totalAllocated)} />
        <SummaryRow strong label="Remaining" value={inr2(allocation.remaining)} tone={allocation.isValid ? 'positive' : 'negative'} />
      </div>
    </div>
  );
}
