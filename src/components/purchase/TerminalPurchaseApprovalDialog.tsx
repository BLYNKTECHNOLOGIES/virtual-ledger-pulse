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
import { createSellerClient } from "@/utils/clientIdGenerator";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncRecord: any;
  onSuccess: () => void;
}

export function TerminalPurchaseApprovalDialog({ open, onOpenChange, syncRecord, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const od = syncRecord?.order_data || {};

  const [tdsOption, setTdsOption] = useState<'none' | '1%' | '20%'>('none');
  const [panNumber, setPanNumber] = useState(syncRecord?.pan_number || '');
  const [bankAccountId, setBankAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [linkedClientId, setLinkedClientId] = useState(syncRecord?.client_id || '');
  const [creatingClient, setCreatingClient] = useState(false);

  // Auto-suggest TDS based on PAN availability
  useEffect(() => {
    if (syncRecord?.pan_number) {
      setTdsOption('1%');
      setPanNumber(syncRecord.pan_number);
    } else {
      setTdsOption('20%');
    }
    setLinkedClientId(syncRecord?.client_id || '');
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

  // Find USDT product
  const usdtProduct = useMemo(() =>
    products.find((p: any) => p.product_name?.toUpperCase().includes('USDT')),
    [products]
  );

  // TDS calculation
  const totalAmount = parseFloat(od.total_price) || 0;
  const tdsRate = tdsOption === '1%' ? 1 : tdsOption === '20%' ? 20 : 0;
  const tdsAmount = totalAmount * (tdsRate / 100);
  const netPayable = totalAmount - tdsAmount;

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: async () => {
      const clientData = await createSellerClient(
        syncRecord.counterparty_name,
        'Terminal Counterparty'
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
      const userId = getCurrentUserId();

      // Validate
      if (tdsOption === '1%' && !panNumber.trim()) {
        throw new Error("PAN is required for 1% TDS");
      }
      if (!bankAccountId) {
        throw new Error("Please select a bank account");
      }

      // Call the same RPC as manual purchase
      const rpcParams = {
        p_order_number: od.order_number || `TRM-${Date.now()}`,
        p_supplier_name: syncRecord.counterparty_name,
        p_order_date: settlementDate,
        p_total_amount: totalAmount,
        p_product_id: usdtProduct?.id,
        p_quantity: parseFloat(od.amount) || 0,
        p_unit_price: parseFloat(od.unit_price) || 0,
        p_bank_account_id: bankAccountId,
        p_description: `Terminal P2P Purchase - ${od.order_number}${remarks ? ` | ${remarks}` : ''}`,
        p_credit_wallet_id: od.wallet_id || undefined,
        p_tds_option: tdsOption,
        p_pan_number: panNumber || undefined,
        p_fee_percentage: undefined, // Fee is already in the commission
        p_is_off_market: false,
        p_created_by: userId || undefined,
      };

      const { data, error } = await supabase.rpc('create_manual_purchase_complete_v2', rpcParams);
      if (error) throw error;

      const result = data as any;
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

      // Update purchase_orders source
      if (result?.purchase_order_id) {
        await supabase
          .from('purchase_orders')
          .update({
            source: 'terminal',
            terminal_sync_id: syncRecord.id,
          })
          .eq('id', result.purchase_order_id);
      }
    },
    onSuccess: () => {
      toast({ title: "Purchase Approved", description: "Terminal order has been approved and purchase created" });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
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
                <LockedField label="Quantity" value={`${Number(od.amount || 0).toLocaleString()} USDT`} />
                <LockedField label="Price Per Unit" value={`₹${Number(od.unit_price || 0).toLocaleString('en-IN')}`} />
                <LockedField label="Total Amount" value={`₹${totalAmount.toLocaleString('en-IN')}`} />
                <LockedField label="Commission/Fee" value={`${Number(od.commission || 0).toLocaleString()} USDT`} />
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
                    Create Client
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">TDS Option</Label>
              <Select value={tdsOption} onValueChange={(v) => setTdsOption(v as any)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border z-50">
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

            <div>
              <Label className="text-xs">Bank Account (Deduction)</Label>
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
