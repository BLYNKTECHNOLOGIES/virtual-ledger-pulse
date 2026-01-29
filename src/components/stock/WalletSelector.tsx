import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useWalletStock } from "@/hooks/useWalletStock";
import { Percent } from "lucide-react";

interface WalletWithFees {
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

interface WalletSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  showBalanceInfo?: boolean;
  filterByType?: string; // e.g., 'USDT' to only show USDT wallets
  onWalletSelect?: (wallet: WalletWithFees | null) => void;
}

export function WalletSelector({ 
  value, 
  onValueChange, 
  label = "Select Wallet",
  placeholder = "Choose a wallet...",
  showBalanceInfo = false,
  filterByType,
  onWalletSelect
}: WalletSelectorProps) {
  
  // Fetch active wallets with fee info
  const { data: wallets } = useQuery({
    queryKey: ['wallets_with_fees', filterByType],
    queryFn: async () => {
      let query = supabase
        .from('wallets')
        .select('id, wallet_name, wallet_address, wallet_type, chain_name, current_balance, is_active, fee_percentage, is_fee_enabled')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (filterByType) {
        query = query.eq('wallet_type', filterByType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WalletWithFees[];
    }
  });

  const { data: walletStock } = useWalletStock();

  const getWalletBalance = (walletId: string): number | null => {
    const wallet = walletStock?.find(w => w.wallet_id === walletId);
    return wallet ? wallet.current_balance : null;
  };

  const handleValueChange = (walletId: string) => {
    onValueChange(walletId);
    if (onWalletSelect) {
      const selectedWallet = wallets?.find(w => w.id === walletId) || null;
      onWalletSelect(selectedWallet);
    }
  };

  const formatFeeLabel = (wallet: WalletWithFees) => {
    if (wallet.is_fee_enabled && (wallet.fee_percentage || 0) > 0) {
      return `${(wallet.fee_percentage || 0).toFixed(2)}% fee`;
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="wallet-select">{label}</Label>
      <Select value={value} onValueChange={handleValueChange}>
        <SelectTrigger id="wallet-select">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-background border shadow-lg z-50">
          {wallets?.map((wallet) => {
            const balance = showBalanceInfo ? getWalletBalance(wallet.id) : null;
            const feeLabel = formatFeeLabel(wallet);
            return (
              <SelectItem key={wallet.id} value={wallet.id}>
                <div className="flex items-center gap-2 w-full">
                  <span className="font-medium">{wallet.wallet_name}</span>
                  {feeLabel && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      <Percent className="h-2.5 w-2.5 mr-0.5" />
                      {feeLabel}
                    </Badge>
                  )}
                  {showBalanceInfo && balance !== null && (
                    <span className="text-sm text-muted-foreground ml-auto">
                      ({balance.toFixed(2)} {wallet.wallet_type})
                    </span>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}