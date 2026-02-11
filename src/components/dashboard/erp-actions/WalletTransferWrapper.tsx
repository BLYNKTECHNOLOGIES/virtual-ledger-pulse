import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

interface WalletTransferWrapperProps {
  item: ErpActionQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function WalletTransferWrapper({ item, open, onOpenChange, onSuccess }: WalletTransferWrapperProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDeposit = item.movement_type === "deposit";

  // For deposits: from = external/mapped wallet, to = user selects
  // For withdrawals: from = mapped wallet, to = user selects
  const [destinationWalletId, setDestinationWalletId] = useState("");

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("is_active", true)
        .order("wallet_name");
      if (error) throw error;
      return data;
    },
  });

  const sourceWallet = wallets?.find((w) => w.id === item.wallet_id);
  const sourceWalletName = sourceWallet?.wallet_name || "Binance Blynk";

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!destinationWalletId) throw new Error("Please select a destination wallet");
      
      const fromWalletId = isDeposit ? item.wallet_id : item.wallet_id;
      const toWalletId = destinationWalletId;
      
      if (!fromWalletId) throw new Error("Source wallet not mapped");

      // Create transfer transactions (debit from source, credit to destination)
      const refId = globalThis.crypto?.randomUUID?.() ?? null;
      
      // Get fresh balances
      const [{ data: fromW }, { data: toW }] = await Promise.all([
        supabase.from("wallets").select("current_balance").eq("id", fromWalletId).single(),
        supabase.from("wallets").select("current_balance").eq("id", toWalletId).single(),
      ]);

      const fromBefore = Number(fromW?.current_balance ?? 0);
      const toBefore = Number(toW?.current_balance ?? 0);
      const amount = Number(item.amount);

      const transactions = [
        {
          wallet_id: fromWalletId,
          transaction_type: "DEBIT",
          amount,
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer to destination wallet (${item.movement_type} reconciliation)`,
          balance_before: fromBefore,
          balance_after: fromBefore - amount,
        },
        {
          wallet_id: toWalletId,
          transaction_type: "CREDIT",
          amount,
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer from ${sourceWalletName} (${item.movement_type} reconciliation)`,
          balance_before: toBefore,
          balance_after: toBefore + amount,
        },
      ];

      const { error: txErr } = await supabase.from("wallet_transactions").insert(transactions);
      if (txErr) throw txErr;

      // Update wallet balances
      await Promise.all([
        supabase.from("wallets").update({ current_balance: fromBefore - amount }).eq("id", fromWalletId),
        supabase.from("wallets").update({ current_balance: toBefore + amount }).eq("id", toWalletId),
      ]);
    },
    onSuccess: () => {
      toast({ title: "Transfer Recorded", description: "Wallet transfer has been processed." });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_stock_summary"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet Transfer — {item.amount} {item.asset}</DialogTitle>
          <DialogDescription>
            Record this {item.movement_type} as an internal wallet transfer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>From Wallet</Label>
            <Input value={sourceWalletName} disabled className="bg-muted" />
          </div>

          <div>
            <Label>To Wallet</Label>
            <Select value={destinationWalletId} onValueChange={setDestinationWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets
                  ?.filter((w) => w.id !== item.wallet_id)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.wallet_name} — {Number(w.current_balance ?? 0).toFixed(2)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input value={Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Asset</Label>
              <Input value={item.asset} disabled className="bg-muted" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || !destinationWalletId}
              className="flex-1"
            >
              {transferMutation.isPending ? "Processing..." : "Confirm Transfer"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
