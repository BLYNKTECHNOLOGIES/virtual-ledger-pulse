import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle, ChevronDown, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { createBuyerClient } from "@/utils/clientIdGenerator";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { format } from "date-fns";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { matchesWordPrefix } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncRecord: any;
  onSuccess: () => void;
}

export function TerminalSalesApprovalDialog({ open, onOpenChange, syncRecord, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const od = syncRecord?.order_data || {};
  const [enrichedName, setEnrichedName] = useState<string | null>(null);
  const displayName = enrichedName || od.verified_name || syncRecord?.counterparty_name || '—';

  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [contactNumber, setContactNumber] = useState(syncRecord?.contact_number || '');
  const [clientState, setClientState] = useState(syncRecord?.state || '');
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');
  const [linkedClientName, setLinkedClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [clientAutoMatched, setClientAutoMatched] = useState(false);

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

    // Find exact match
    const exactMatch = allClients.find(
      c => !(c as any).is_deleted && c.buyer_approval_status !== 'REJECTED' && c.name.trim().toLowerCase() === name
    );

    if (exactMatch) {
      setLinkedClientId(exactMatch.id);
      setLinkedClientName(exactMatch.name);
      setClientAutoMatched(true);
      // Auto-populate contact/state from client if not already set
      if (!contactNumber && exactMatch.phone) setContactNumber(exactMatch.phone);
      if (!clientState && exactMatch.state) setClientState(exactMatch.state);
    }
  }, [open, displayName, allClients]);

  // Helper: lookup contact records by nickname(s) and pre-fill
  const lookupContact = async (nicknames: string[]) => {
    const unique = [...new Set(nicknames.filter(Boolean))];
    if (unique.length === 0) return;

    const { data: exactRecords } = await supabase
      .from('counterparty_contact_records')
      .select('contact_number, state')
      .in('counterparty_nickname', unique);
    const exactFound = (exactRecords || []).find(r => r.contact_number || r.state);
    if (exactFound) {
      if (exactFound.contact_number) setContactNumber(exactFound.contact_number);
      if (exactFound.state) setClientState(exactFound.state);
      return;
    }

    for (const nick of unique) {
      if (nick.includes('*')) {
        const prefix = nick.replace(/\*+$/, '');
        if (prefix.length >= 2) {
          const { data: prefixRecords } = await supabase
            .from('counterparty_contact_records')
            .select('contact_number, state')
            .ilike('counterparty_nickname', `${prefix}%`);
          const found = (prefixRecords || []).find(r => r.contact_number || r.state);
          if (found) {
            if (found.contact_number) setContactNumber(found.contact_number);
            if (found.state) setClientState(found.state);
            return;
          }
        }
      }
    }
  };

  // Reset state and fetch verified name when dialog opens
  useEffect(() => {
    setLinkedClientId(syncRecord?.client_id || '');
    setLinkedClientName('');
    setContactNumber(syncRecord?.contact_number || '');
    setClientState(syncRecord?.state || '');
    setEnrichedName(null);
    setClientAutoMatched(false);
    setShowClientDropdown(false);

    if (!open || !syncRecord) return;

    const maskedNickname = od.counterparty_nickname || syncRecord?.counterparty_name;
    const orderNumber = od.order_number || syncRecord?.binance_order_number;
    const hasVerifiedName = !!od.verified_name;
    const needsContactLookup = !syncRecord?.contact_number && !syncRecord?.state;

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
              order_data: { ...od, verified_name: buyerRealName },
            })
            .eq('id', syncRecord.id)
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
  }, [syncRecord, open]);

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
    // Auto-populate contact/state from selected client
    if (client.phone && !contactNumber) setContactNumber(client.phone);
    if (client.state && !clientState) setClientState(client.state);
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
      const userId = getCurrentUserId();

      if (!paymentMethodId) {
        throw new Error("Please select a payment method");
      }

      const selectedMethod = paymentMethods.find((m: any) => m.id === paymentMethodId);
      const isGateway = Boolean(selectedMethod?.payment_gateway);

      const orderNumber = `SO-TRM-${od.order_number?.slice(-8) || Date.now()}`;
      const orderDate = od.create_time
        ? new Date(od.create_time).toISOString().split('T')[0]
        : settlementDate;

      const { data: salesOrder, error: soErr } = await supabase
        .from('sales_orders')
        .insert({
          order_number: orderNumber,
          client_name: displayName,
          client_phone: contactNumber || null,
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
          created_by: userId || null,
          source: 'terminal',
          terminal_sync_id: syncRecord.id,
        })
        .select('id')
        .single();

      if (soErr) throw soErr;

      // Process wallet deduction
      if (od.wallet_id && quantity > 0) {
        const { error: walletErr } = await supabase.rpc('process_sales_order_wallet_deduction', {
          sales_order_id: salesOrder.id,
          usdt_amount: quantity,
          wallet_id: od.wallet_id,
        });
        if (walletErr) {
          await supabase.from('sales_orders').delete().eq('id', salesOrder.id);
          throw new Error(`Wallet deduction failed: ${walletErr.message}. Sales order was not created.`);
        }

        // Deduct Binance commission as separate SALES_ORDER_FEE transaction
        if (commission > 0) {
          await supabase
            .from('wallet_transactions')
            .insert({
              wallet_id: od.wallet_id,
              transaction_type: 'DEBIT',
              amount: commission,
              reference_type: 'SALES_ORDER_FEE',
              reference_id: salesOrder.id,
              description: `Platform fee for sales order #${orderNumber} (Binance commission)`,
              balance_before: 0,
              balance_after: 0,
              asset_code: 'USDT',
            });

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

      // Handle bank transaction / payment gateway usage
      if (selectedMethod?.payment_gateway) {
        const newUsage = (selectedMethod.current_usage || 0) + totalAmount;
        await supabase
          .from('sales_payment_methods')
          .update({ current_usage: newUsage })
          .eq('id', paymentMethodId);
      }

      console.log('[SalesApproval] Sales order created - bank transaction handled by triggers if applicable');

      // Update sync record
      const { error: updateErr } = await supabase
        .from('terminal_sales_sync')
        .update({
          sync_status: 'approved',
          sales_order_id: salesOrder.id,
          client_id: linkedClientId || null,
          contact_number: contactNumber || null,
          state: clientState || null,
          reviewed_by: userId || null,
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
            collected_by: userId || undefined,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'counterparty_nickname' });
      }

      // Sync contact to client master
      if (linkedClientId && (contactNumber || clientState)) {
        const updates: any = {};
        if (contactNumber) updates.phone = contactNumber;
        if (clientState) updates.state = clientState;
        await supabase.from('clients').update(updates).eq('id', linkedClientId);
      }
    },
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
                <LockedField label="Quantity Sold" value={`${Number(od.amount || 0).toLocaleString()} USDT`} />
                <LockedField label="Price Per Unit" value={`₹${Number(od.unit_price || 0).toLocaleString('en-IN')}`} />
                <LockedField label="Total Amount" value={`₹${totalAmount.toLocaleString('en-IN')}`} />
                <LockedField label="Commission/Fee" value={`${Number(od.commission || 0).toLocaleString()} USDT`} />
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
              <Label className="text-xs">Settlement Date</Label>
              <Input
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="mt-1 h-9 text-sm"
              />
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
