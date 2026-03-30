import { useState, useMemo, useEffect } from "react";
import { isPhoneBlocked } from "@/lib/blocked-phones";
import { parseApprovalError } from "@/utils/approvalErrorParser";
import { fetchCoinMarketRate } from "@/hooks/useCoinMarketRate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, ChevronDown, Search, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { requireCurrentUserId } from "@/lib/system-action-logger";

import { createBuyerClient } from "@/utils/clientIdGenerator";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { format } from "date-fns";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { matchesWordPrefix } from "@/lib/utils";
import { DataConflictBanner } from "@/components/terminal/DataConflictBanner";

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
  const [clientAutoMatched, setClientAutoMatched] = useState(false);
  const [counterpartyPhone, setCounterpartyPhone] = useState('');
  const [counterpartyState, setCounterpartyState] = useState('');
  const [clientMasterPhone, setClientMasterPhone] = useState('');
  const [clientMasterState, setClientMasterState] = useState('');

  // Fetch all clients for matching
  const { data: allClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
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

  // Auto-select client when dialog opens or verified name changes
  useEffect(() => {
    if (!open || !displayName || displayName === '—') return;
    // Don't auto-match if user has already manually selected or if already matched
    if (linkedClientId && !clientAutoMatched) return;

    const name = displayName.trim().toLowerCase();
    if (!name) return;

    // Find ALL exact matches — only among non-deleted, non-rejected clients
    const exactMatches = allClients.filter(
      c => !(c as any).is_deleted && c.buyer_approval_status !== 'REJECTED' && c.name.trim().toLowerCase() === name
    );

    if (exactMatches.length === 1) {
      // Single exact match — safe to auto-link
      const exactMatch = exactMatches[0];
      setLinkedClientId(exactMatch.id);
      setLinkedClientName(exactMatch.name);
      setClientAutoMatched(true);
      const isApprovedClient = String(exactMatch.buyer_approval_status || '').toUpperCase() === 'APPROVED';
      if (!contactNumber && exactMatch.phone) setContactNumber(exactMatch.phone);
      if (!clientState && exactMatch.state && isApprovedClient) {
        const normalizedState = normalizeIndianState(exactMatch.state);
        if (normalizedState) setClientState(normalizedState);
      }
    } else if (exactMatches.length > 1) {
      // Multiple clients with same name — force operator to choose
      console.warn(`[SalesApproval] Multiple clients found for "${displayName}" — requires manual selection`);
      setLinkedClientId('');
      setLinkedClientName('');
      setClientAutoMatched(false);
      setShowClientDropdown(true);
    }
    // Don't blank out contact/state when no client match — counterparty data may already be filled
  }, [open, displayName, allClients, linkedClientId, clientAutoMatched, contactNumber, clientState]);

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
        // Pre-fill form fields from terminal-captured data (highest priority)
        if (phone) setContactNumber(prev => prev || phone);
        if (state) setClientState(prev => prev || state);
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
      setContactNumber(prev => prev || exactFound.contact_number!);
    }
    const normalizedState = normalizeIndianState(exactFound?.state);
    if (normalizedState) {
      setClientState(prev => prev || normalizedState);
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
    const needsContactLookup = !currentSync.contact_number && !currentSync.state;

    if (orderNumber) {
      supabase.functions.invoke('binance-ads', {
        body: { action: 'getOrderDetail', orderNumber },
      }).then(({ data }) => {
        const detail = data?.data;
        const buyerRealName = detail?.buyerRealName || detail?.buyerName || null;
        const buyerNickname = detail?.buyerNickname || null;

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

        if (needsContactLookup) {
          lookupContact([buyerNickname, maskedNickname, buyerRealName].filter(Boolean) as string[]);
        }
      }).catch(() => {
        if (needsContactLookup && maskedNickname) {
          lookupContact([maskedNickname]);
        }
      });
    } else if (needsContactLookup && maskedNickname) {
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
      return data || [];
    },
  });

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const usdtProduct = useMemo(() =>
    products.find((p: any) => p.product_name?.toUpperCase().includes('USDT')),
    [products]
  );

  const totalAmount = parseFloat(od.total_price) || 0;
  const quantity = parseFloat(od.amount) || 0;
  const unitPrice = parseFloat(od.unit_price) || 0;
  const commission = parseFloat(od.commission) || 0;

  // Handle client selection from dropdown
  const handleClientSelect = (client: any) => {
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
      const clientData = await createBuyerClient(
        displayName,
        contactNumber || undefined,
        clientState || undefined,
      );
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

      if (!paymentMethodId) {
        throw new Error("Please select a payment method");
      }

      const selectedMethod = paymentMethods.find((m: any) => m.id === paymentMethodId);
      const isGateway = Boolean(selectedMethod?.payment_gateway);

      const orderNumber = `SO-TRM-${od.order_number?.slice(-12) || Date.now()}`;
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
      const marketRateUsdt = await fetchCoinMarketRate(asset);

      // Check if a sales order already exists for THIS sync record (partial approval recovery)
      // Use terminal_sync_id instead of order_number to avoid false matches from collisions
      const { data: existingSO } = await supabase
        .from('sales_orders')
        .select('id')
        .eq('terminal_sync_id', syncRecord.id)
        .maybeSingle();

      let salesOrder: { id: string };

      if (existingSO) {
        // Sales order already exists from a previous partial approval — reuse it
        salesOrder = existingSO;
      } else {
        const { data: newSO, error: soErr } = await supabase
          .from('sales_orders')
          .insert({
            order_number: orderNumber,
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
            sales_payment_method_id: paymentMethodId,
            payment_status: 'COMPLETED',
            status: 'COMPLETED',
            settlement_status: isGateway ? 'PENDING' : 'DIRECT',
            is_off_market: false,
            description: `Terminal P2P Sale - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
            created_by: userId,
            source: 'terminal',
            terminal_sync_id: syncRecord.id,
            market_rate_usdt: marketRateUsdt > 0 ? marketRateUsdt : null,
          })
          .select('id')
          .single();

        if (soErr) throw soErr;
        salesOrder = newSO;
      }

      // Skip wallet/fee processing if recovering from a partial approval (already done)
      if (!existingSO) {
      // Binance SELL wallet impact = sold quantity + commission (commission is a separate crypto expense).
      // Post the full physical deduction in one wallet debit to prevent recurring drift.
      if (od.wallet_id && quantity > 0) {
        const assetCode = (od.asset || 'USDT').toUpperCase();
        const totalWalletDebit = quantity + Math.max(commission, 0);

        const { error: walletErr } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: salesOrder.id,
          usdt_amount: totalWalletDebit,
          wallet_id: od.wallet_id,
          p_asset_code: assetCode,
        });
        if (walletErr) {
          await supabase.from('sales_orders').delete().eq('id', salesOrder.id);
          throw new Error(`Wallet deduction failed: ${walletErr.message}. Sales order was not created.`);
        }

        // Keep fee analytics/reporting without creating a second wallet DEBIT row.
        if (commission > 0) {
          const { data: usdtProd } = await supabase
            .from('products')
            .select('average_buying_price')
            .eq('code', 'USDT')
            .single();
          const avgBuyPrice = Number(usdtProd?.average_buying_price || 0);

          await supabase
            .from('wallet_fee_deductions')
            .insert({
              wallet_id: od.wallet_id,
              order_id: salesOrder.id,
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
            });
        }
      }

      // Payment method usage is computed live — no manual current_usage update needed

      } // end if (!existingSO)

      // Update sync record
      const { error: updateErr } = await supabase
        .from('terminal_sales_sync')
        .update({
          sync_status: 'approved',
          sales_order_id: salesOrder.id,
          client_id: linkedClientId || null,
          contact_number: contactNumber || null,
          state: clientState || null,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', syncRecord.id);
      if (updateErr) throw updateErr;

      // Update counterparty contact records
      if (contactNumber || clientState) {
        await supabase
          .from('counterparty_contact_records')
          .upsert({
            counterparty_nickname: od.counterparty_nickname || syncRecord.counterparty_name,
            contact_number: contactNumber || null,
            state: clientState || null,
            collected_by: userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'counterparty_nickname' });
      }

      // Sync contact/state to client master — only update fields that are currently missing on the client.
      // If the operator provides phone/state in this dialog and the client doesn't have them yet, fill them in.
      // This ensures repeat orders progressively enrich the client profile without overwriting existing data.
      if (linkedClientId && (contactNumber || clientState)) {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('phone, state')
          .eq('id', linkedClientId)
          .maybeSingle();

        const updates: any = {};
        // Always overwrite phone/state if operator provides a value (operator correction or enrichment)
        if (contactNumber && existingClient?.phone !== contactNumber) {
          updates.phone = contactNumber;
        }
        if (clientState && existingClient?.state !== clientState) {
          updates.state = clientState;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('clients').update(updates).eq('id', linkedClientId);
        }
      }

      // If client is newly created (buyer_approval_status = PENDING), create onboarding approval
      if (linkedClientId) {
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
            await supabase.from('client_onboarding_approvals').insert({
              sales_order_id: salesOrder.id,
              client_name: clientRecord.name || displayName,
              client_phone: (clientRecord.phone && !await isPhoneBlocked(clientRecord.phone)) ? clientRecord.phone : ((contactNumber && !await isPhoneBlocked(contactNumber)) ? contactNumber : null),
              // Pass state only if operator manually entered it in the dialog.
              // If left blank (null), Buyer Approval officer will enter it during review.
              client_state: clientState || null,
              order_amount: totalAmount,
              order_date: orderDate,
              approval_status: 'PENDING',
            });
          }
        }
      }
    }, // end mutationFn
    onSuccess: () => {
      toast({ title: "Sales Order Approved", description: "Terminal sell order has been approved and sales order created" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
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
      toast({ title, description, variant: "destructive" });
    },
  });

  const orderDate = od.create_time ? format(new Date(od.create_time), 'dd MMM yyyy, HH:mm') : '—';

  // Get the selected client object for hover preview
  const selectedClient = useMemo(() => {
    if (!linkedClientId) return null;
    return allClients.find(c => c.id === linkedClientId) || null;
  }, [linkedClientId, allClients]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Approve Terminal Sale</DialogTitle>
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
                <LockedField label="Quantity Sold" value={`${Number(od.amount || 0).toLocaleString('en-IN')} USDT`} />
                <LockedField label="Price Per Unit" value={`₹${Number(od.unit_price || 0).toLocaleString('en-IN')}`} />
                <LockedField label="Total Amount" value={`₹${totalAmount.toLocaleString('en-IN')}`} />
                <LockedField label="Commission/Fee" value={`${Number(od.commission || 0).toLocaleString('en-IN')} USDT`} />
                <LockedField label="Wallet" value={od.wallet_name || '—'} />
                <LockedField label="Buyer Name" value={displayName} />
                <LockedField label="Payment Method" value={od.pay_method || '—'} />
              </div>
            </CardContent>
          </Card>

          {/* Client Mapping - Intelligent Search */}
          <Card className="border-blue-100 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Client Mapping</Label>
                {matchingClients.length > 0 && !linkedClientId && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                    <Search className="h-2.5 w-2.5 mr-1" />
                    {matchingClients.length} match{matchingClients.length > 1 ? 'es' : ''} found
                  </Badge>
                )}
              </div>

              {/* Linked client - with hover preview */}
              {linkedClientId && selectedClient ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <HoverCard openDelay={300} closeDelay={100} onOpenChange={(isOpen) => {
                      if (isOpen) setHoveredClientId(selectedClient.id);
                    }}>
                      <HoverCardTrigger asChild>
                        <span className="text-sm font-medium cursor-pointer hover:underline underline-offset-2">
                          {selectedClient.name}
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="right"
                        align="start"
                        className="w-80 p-3 z-[9999] bg-popover border border-border shadow-xl"
                        sideOffset={8}
                      >
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
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                      {selectedClient.client_id}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">Linked</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground hover:text-destructive ml-auto"
                      onClick={handleUnlinkClient}
                    >
                      Change
                    </Button>
                  </div>
                  {/* Show Buyer Approval Pending warning for newly created clients */}
                  {selectedClient.buyer_approval_status === 'PENDING' && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        New Client – Buyer Approval Pending. This client will appear in the Buyer Approvals queue after this sale is approved.
                      </span>
                    </div>
                  )}
                </div>
              ) : linkedClientId && !selectedClient ? (
                // Fallback: client ID exists but not found in allClients yet
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{linkedClientName || displayName}</span>
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Linked</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-muted-foreground hover:text-destructive ml-auto"
                    onClick={handleUnlinkClient}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  {/* No client linked — show matching suggestions or create option */}
                  {matchingClients.length > 0 ? (
                    <div className="space-y-2">
                      {matchingClients.filter(c => c.name.trim().toLowerCase() === displayName.trim().toLowerCase()).length > 1 && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2">
                          <Users className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            Multiple clients exist with the same name. Please verify details (phone, state, PAN) and select the correct one.
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Matching clients found for "<span className="font-medium text-foreground">{displayName}</span>". Select the correct client:
                      </p>
                      <div className="border border-border rounded-md bg-background max-h-48 overflow-y-auto">
                        {matchingClients.map((client) => (
                          <HoverCard key={client.id} openDelay={300} closeDelay={100} onOpenChange={(isOpen) => {
                            if (isOpen) setHoveredClientId(client.id);
                          }}>
                            <HoverCardTrigger asChild>
                              <div
                                className="flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 transition-colors"
                                onClick={() => handleClientSelect(client)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-sm truncate">{client.name}</span>
                                  {client.name.trim().toLowerCase() === displayName.trim().toLowerCase() && (
                                    <Badge className="text-[9px] h-4 bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400">
                                      Exact
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge variant="secondary" className="text-[10px]">{client.client_id}</Badge>
                                  {client.phone && (
                                    <span className="text-[10px] text-muted-foreground">{client.phone}</span>
                                  )}
                                </div>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent
                              side="right"
                              align="start"
                              className="w-80 p-3 z-[9999] bg-popover border border-border shadow-xl"
                              sideOffset={8}
                            >
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
                      {/* Create new client option */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">None of these?</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1"
                          onClick={() => createClientMutation.mutate()}
                          disabled={createClientMutation.isPending}
                        >
                          {createClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                          Create New Buyer Client
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-muted-foreground">No matching client found for "{displayName}"</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => createClientMutation.mutate()}
                        disabled={createClientMutation.isPending}
                      >
                        {createClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                        Create Buyer Client
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Data Conflict Banner */}
          <DataConflictBanner conflicts={salesConflicts} />

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger className="mt-1 h-9 text-sm">
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

            <div>
              <Label className="text-xs">Contact Number</Label>
              <Input
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Buyer contact number"
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
            disabled={approveMutation.isPending || !paymentMethodId}
          >
            {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve & Create Sale
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
