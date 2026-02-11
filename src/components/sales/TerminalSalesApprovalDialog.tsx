import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Loader2, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { createBuyerClient } from "@/utils/clientIdGenerator";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { format } from "date-fns";

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

  const [bankAccountId, setBankAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [contactNumber, setContactNumber] = useState(syncRecord?.contact_number || '');
  const [clientState, setClientState] = useState(syncRecord?.state || '');
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');

  useEffect(() => {
    setLinkedClientId(syncRecord?.client_id || '');
    setContactNumber(syncRecord?.contact_number || '');
    setClientState(syncRecord?.state || '');
  }, [syncRecord]);

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

  const usdtProduct = useMemo(() =>
    products.find((p: any) => p.product_name?.toUpperCase().includes('USDT')),
    [products]
  );

  const totalAmount = parseFloat(od.total_price) || 0;
  const quantity = parseFloat(od.amount) || 0;
  const unitPrice = parseFloat(od.unit_price) || 0;
  const commission = parseFloat(od.commission) || 0;

  // Create buyer client mutation
  const createClientMutation = useMutation({
    mutationFn: async () => {
      const clientData = await createBuyerClient(
        syncRecord.counterparty_name,
        contactNumber || undefined,
        clientState || undefined,
      );
      return clientData;
    },
    onSuccess: (client: any) => {
      setLinkedClientId(client.id);
      toast({ title: "Client Created", description: `${syncRecord.counterparty_name} added as buyer client` });
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

      if (!bankAccountId) {
        throw new Error("Please select a bank account");
      }

      // Generate order number
      const orderNumber = `SO-TRM-${od.order_number?.slice(-8) || Date.now()}`;
      const orderDate = od.create_time
        ? new Date(od.create_time).toISOString().split('T')[0]
        : settlementDate;

      // Insert sales order
      const { data: salesOrder, error: soErr } = await supabase
        .from('sales_orders')
        .insert({
          order_number: orderNumber,
          client_name: syncRecord.counterparty_name,
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
          payment_status: 'COMPLETED',
          status: 'COMPLETED',
          is_off_market: false,
          description: `Terminal P2P Sale - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
          created_by: userId || null,
          source: 'terminal',
          terminal_sync_id: syncRecord.id,
        })
        .select('id')
        .single();

      if (soErr) throw soErr;

      // Process wallet deduction (inventory reduction)
      if (od.wallet_id && quantity > 0) {
        try {
          const { error: walletErr } = await supabase.rpc('process_sales_order_wallet_deduction', {
            sales_order_id: salesOrder.id,
            usdt_amount: quantity,
            wallet_id: od.wallet_id,
          });
          if (walletErr) console.warn('[SalesApproval] Wallet deduction warning:', walletErr);
        } catch (e) {
          console.warn('[SalesApproval] Wallet deduction failed:', e);
        }
      }

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
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const orderDate = od.create_time ? format(new Date(od.create_time), 'dd MMM yyyy, HH:mm') : '—';

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
                <LockedField label="Buyer Name" value={syncRecord?.counterparty_name || '—'} />
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
                  <span className="text-sm">{syncRecord?.counterparty_name}</span>
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Linked</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">No matching client found</span>
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
            </CardContent>
          </Card>

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Bank Account (Settlement)</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>
                <SelectContent className="bg-white border z-50">
                  {bankAccounts.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.account_name} - {b.bank_name}
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
                <SelectContent className="bg-white border z-50 max-h-[200px]">
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
            disabled={approveMutation.isPending || !bankAccountId}
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
