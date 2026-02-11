import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Link2, Unlink, Loader2, Wallet, Settings2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TerminalWalletLink {
  id: string;
  wallet_id: string;
  platform_source: string;
  api_identifier: string;
  supported_assets: string[];
  fee_treatment: string;
  status: string;
  created_at: string;
  wallet_name?: string;
}

export function WalletLinkingSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [feeTreatment, setFeeTreatment] = useState("capitalize");
  const [linkStatus, setLinkStatus] = useState("active");

  // Fetch terminal wallet links with wallet names
  const { data: walletLinks = [], isLoading } = useQuery({
    queryKey: ['terminal-wallet-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_wallet_links')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch wallet names
      if (data && data.length > 0) {
        const walletIds = data.map((l: any) => l.wallet_id);
        const { data: wallets } = await supabase
          .from('wallets')
          .select('id, wallet_name')
          .in('id', walletIds);
        
        const walletMap = new Map((wallets || []).map((w: any) => [w.id, w.wallet_name]));
        return data.map((l: any) => ({ ...l, wallet_name: walletMap.get(l.wallet_id) || 'Unknown' })) as TerminalWalletLink[];
      }
      return [] as TerminalWalletLink[];
    },
  });

  // Fetch available wallets for linking
  const { data: availableWallets = [] } = useQuery({
    queryKey: ['wallets-for-linking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Link wallet mutation
  const linkMutation = useMutation({
    mutationFn: async () => {
      // Deactivate any existing active link for this platform
      await supabase
        .from('terminal_wallet_links')
        .update({ status: 'dormant' })
        .eq('platform_source', 'terminal')
        .eq('status', 'active');

      const { error } = await supabase
        .from('terminal_wallet_links')
        .insert({
          wallet_id: selectedWalletId,
          platform_source: 'terminal',
          api_identifier: 'binance_p2p',
          supported_assets: ['USDT'],
          fee_treatment: feeTreatment,
          status: linkStatus,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Wallet linked to Terminal" });
      queryClient.invalidateQueries({ queryKey: ['terminal-wallet-links'] });
      setShowLinkDialog(false);
      setSelectedWalletId("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Toggle status mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      if (newStatus === 'active') {
        // Deactivate others first
        await supabase
          .from('terminal_wallet_links')
          .update({ status: 'dormant' })
          .eq('platform_source', 'terminal')
          .eq('status', 'active');
      }
      const { error } = await supabase
        .from('terminal_wallet_links')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-wallet-links'] });
    },
  });

  // Update fee treatment mutation
  const updateFeeMutation = useMutation({
    mutationFn: async ({ id, fee_treatment }: { id: string; fee_treatment: string }) => {
      const { error } = await supabase
        .from('terminal_wallet_links')
        .update({ fee_treatment })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Fee treatment updated" });
      queryClient.invalidateQueries({ queryKey: ['terminal-wallet-links'] });
    },
  });

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('terminal_wallet_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Wallet unlinked from Terminal" });
      queryClient.invalidateQueries({ queryKey: ['terminal-wallet-links'] });
    },
  });

  return (
    <Card className="border-dashed border-cyan-200 bg-cyan-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-cyan-600" />
              Terminal Wallet Links
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Map ERP wallets to Terminal platforms for automated inventory posting
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowLinkDialog(true)} className="gap-1">
            <Link2 className="h-3.5 w-3.5" />
            Link Wallet
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : walletLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No wallets linked to Terminal yet. Link a wallet to enable purchase sync.
          </p>
        ) : (
          walletLinks.map((link) => (
            <div key={link.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-100">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-medium">{link.wallet_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{link.api_identifier}</Badge>
                    <Badge variant="outline" className="text-[10px]">{link.supported_assets?.join(', ')}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      <Settings2 className="h-2.5 w-2.5 mr-0.5" />
                      Fee: {link.fee_treatment}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={link.fee_treatment}
                  onValueChange={(v) => updateFeeMutation.mutate({ id: link.id, fee_treatment: v })}
                >
                  <SelectTrigger className="w-[120px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border z-50">
                    <SelectItem value="capitalize">Capitalize</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <Switch
                  checked={link.status === 'active'}
                  onCheckedChange={(checked) => toggleMutation.mutate({ id: link.id, newStatus: checked ? 'active' : 'dormant' })}
                />
                <Badge variant={link.status === 'active' ? 'default' : 'secondary'} className="text-[10px] min-w-[60px] justify-center">
                  {link.status === 'active' ? '● Active' : 'Dormant'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => unlinkMutation.mutate(link.id)}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Link Terminal Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Wallet</Label>
              <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent className="bg-white border z-50">
                  {availableWallets.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.wallet_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Platform</Label>
              <div className="mt-1 p-2 rounded-md bg-muted text-sm">Binance P2P (binance_p2p)</div>
            </div>
            <div>
              <Label className="text-xs">Supported Assets</Label>
              <div className="mt-1 p-2 rounded-md bg-muted text-sm">USDT</div>
            </div>
            <div>
              <Label className="text-xs">Fee Treatment</Label>
              <Select value={feeTreatment} onValueChange={setFeeTreatment}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white border z-50">
                  <SelectItem value="capitalize">Capitalize (add to inventory cost)</SelectItem>
                  <SelectItem value="expense">Expense (book separately)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Status</Label>
              <div className="flex items-center gap-2">
                <Switch checked={linkStatus === 'active'} onCheckedChange={(c) => setLinkStatus(c ? 'active' : 'dormant')} />
                <span className="text-xs">{linkStatus === 'active' ? 'Active' : 'Dormant'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={() => linkMutation.mutate()} disabled={!selectedWalletId || linkMutation.isPending}>
              {linkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Link Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
