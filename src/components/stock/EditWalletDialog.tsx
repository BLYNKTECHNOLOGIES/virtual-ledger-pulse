import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  wallet_name: string;
  wallet_address: string;
  wallet_type: string;
  chain_name?: string;
  current_balance: number;
  is_active: boolean;
  fee_percentage?: number;
  is_fee_enabled?: boolean;
}

interface EditWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Wallet | null;
}

export function EditWalletDialog({ open, onOpenChange, wallet }: EditWalletDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    wallet_name: '',
    wallet_address: '',
    wallet_type: 'USDT',
    chain_name: '',
    fee_percentage: '0',
    is_fee_enabled: true,
    is_active: true
  });

  useEffect(() => {
    if (wallet) {
      setFormData({
        wallet_name: wallet.wallet_name || '',
        wallet_address: wallet.wallet_address || '',
        wallet_type: wallet.wallet_type || 'USDT',
        chain_name: wallet.chain_name || '',
        fee_percentage: (wallet.fee_percentage ?? 0).toString(),
        is_fee_enabled: wallet.is_fee_enabled ?? true,
        is_active: wallet.is_active
      });
    }
  }, [wallet]);

  const updateWalletMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!wallet) throw new Error('No wallet selected');
      
      const { error } = await supabase
        .from('wallets')
        .update({
          wallet_name: data.wallet_name,
          wallet_address: data.wallet_address,
          wallet_type: data.wallet_type,
          chain_name: data.chain_name,
          fee_percentage: parseFloat(data.fee_percentage) || 0,
          is_fee_enabled: data.is_fee_enabled,
          is_active: data.is_active
        })
        .eq('id', wallet.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Wallet updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to update wallet", 
        variant: "destructive" 
      });
      console.error('Error updating wallet:', error);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateWalletMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Wallet</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="wallet_name">Wallet Name</Label>
            <Input
              id="wallet_name"
              value={formData.wallet_name}
              onChange={(e) => setFormData({ ...formData, wallet_name: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="wallet_address">Wallet Address</Label>
            <Input
              id="wallet_address"
              value={formData.wallet_address}
              onChange={(e) => setFormData({ ...formData, wallet_address: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="chain_name">Chain Name</Label>
            <Select value={formData.chain_name} onValueChange={(value) => setFormData({ ...formData, chain_name: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="Ethereum">Ethereum (ETH)</SelectItem>
                <SelectItem value="Binance Smart Chain">Binance Smart Chain (BSC)</SelectItem>
                <SelectItem value="Polygon">Polygon (MATIC)</SelectItem>
                <SelectItem value="Tron">Tron (TRX)</SelectItem>
                <SelectItem value="Solana">Solana (SOL)</SelectItem>
                <SelectItem value="Bitcoin">Bitcoin (BTC)</SelectItem>
                <SelectItem value="APTOS">APTOS (APT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="wallet_type">Wallet Type</Label>
            <Select value={formData.wallet_type} onValueChange={(value) => setFormData({ ...formData, wallet_type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="BTC">Bitcoin</SelectItem>
                <SelectItem value="ETH">Ethereum</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="font-medium text-sm">Platform Fee Settings</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_fee_enabled">Enable Fee Deduction</Label>
                <p className="text-xs text-muted-foreground">Automatically deduct fees from orders using this wallet</p>
              </div>
              <Switch
                id="is_fee_enabled"
                checked={formData.is_fee_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, is_fee_enabled: checked })}
              />
            </div>
            
            <div>
              <Label htmlFor="fee_percentage">Fee Percentage (%)</Label>
              <Input
                id="fee_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.fee_percentage}
                onChange={(e) => setFormData({ ...formData, fee_percentage: e.target.value })}
                placeholder="e.g., 1.5"
                disabled={!formData.is_fee_enabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This percentage will be deducted from order amounts
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Active Status</Label>
              <p className="text-xs text-muted-foreground">Inactive wallets won't appear in selections</p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={updateWalletMutation.isPending}>
              {updateWalletMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
