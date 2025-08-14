import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useWalletStock } from "@/hooks/useWalletStock";

interface WalletSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  showBalanceInfo?: boolean;
  filterByType?: string; // e.g., 'USDT' to only show USDT wallets
}

export function WalletSelector({ 
  value, 
  onValueChange, 
  label = "Select Wallet",
  placeholder = "Choose a wallet...",
  showBalanceInfo = false,
  filterByType
}: WalletSelectorProps) {
  
  // Fetch active wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets', filterByType],
    queryFn: async () => {
      let query = supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      
      if (filterByType) {
        query = query.eq('wallet_type', filterByType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  const { data: walletStock } = useWalletStock();

  const getWalletBalance = (walletId: string): number | null => {
    const wallet = walletStock?.find(w => w.wallet_id === walletId);
    return wallet ? wallet.current_balance : null;
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="wallet-select">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="wallet-select">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {wallets?.map((wallet) => {
            const balance = showBalanceInfo ? getWalletBalance(wallet.id) : null;
            return (
              <SelectItem key={wallet.id} value={wallet.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{wallet.wallet_name}</span>
                  {showBalanceInfo && balance !== null && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({balance.toLocaleString()} {wallet.wallet_type})
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