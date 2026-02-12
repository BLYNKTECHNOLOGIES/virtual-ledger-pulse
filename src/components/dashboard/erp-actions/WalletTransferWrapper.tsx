import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErpActionQueueItem } from "@/hooks/useErpActionQueue";

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

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [fee, setFee] = useState("");

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

  const mappedWallet = wallets?.find((w) => w.id === item.wallet_id);
  const mappedWalletName = mappedWallet?.wallet_name || "Binance Blynk";

  const fromWalletId = isDeposit ? selectedWalletId : item.wallet_id;
  const toWalletId = isDeposit ? item.wallet_id : selectedWalletId;
  const fromWalletLabel = isDeposit ? (wallets?.find(w => w.id === selectedWalletId)?.wallet_name || "—") : mappedWalletName;
  const toWalletLabel = isDeposit ? mappedWalletName : (wallets?.find(w => w.id === selectedWalletId)?.wallet_name || "—");

  const feeAmount = parseFloat(fee) || 0;
  const transferAmount = Number(item.amount);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWalletId) throw new Error(isDeposit ? "Please select source wallet" : "Please select destination wallet");
      if (!fromWalletId || !toWalletId) throw new Error("Wallet not mapped");
      if (feeAmount < 0) throw new Error("Fee cannot be negative");
      if (feeAmount >= transferAmount) throw new Error("Fee cannot exceed transfer amount");

      const refId = globalThis.crypto?.randomUUID?.() ?? null;

      // Insert transfer transactions — triggers handle balance updates
      const transactions: any[] = [
        {
          wallet_id: fromWalletId,
          transaction_type: "DEBIT",
          amount: transferAmount,
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer to ${toWalletLabel} (${item.movement_type} reconciliation)`,
        },
        {
          wallet_id: toWalletId,
          transaction_type: "CREDIT",
          amount: transferAmount,
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer from ${fromWalletLabel} (${item.movement_type} reconciliation)${feeAmount > 0 ? ` | Fee: ${feeAmount.toFixed(4)} ${item.asset} deducted from source` : ''}`,
        },
      ];

      // If fee exists, record a separate fee transaction on the source wallet
      if (feeAmount > 0) {
        transactions.push({
          wallet_id: fromWalletId,
          transaction_type: "DEBIT",
          amount: feeAmount,
          asset_code: item.asset,
          reference_type: "TRANSFER_FEE",
          reference_id: refId,
          description: `Transfer fee for wallet transfer (${fromWalletLabel} → ${toWalletLabel})`,
        });
      }

      const { error: txErr } = await supabase.from("wallet_transactions").insert(transactions);
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      toast({ title: "Transfer Recorded", description: `Wallet transfer processed.${feeAmount > 0 ? ` Fee: ${feeAmount.toFixed(4)} ${item.asset}` : ''}` });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_stock_summary"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_asset_balances"] });
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
          {isDeposit ? (
            <>
              <div>
                <Label>From Wallet</Label>
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source wallet" />
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
              <div>
                <Label>To Wallet (Pre-filled)</Label>
                <Input value={mappedWalletName} disabled className="bg-muted" />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>From Wallet (Pre-filled)</Label>
                <Input value={mappedWalletName} disabled className="bg-muted" />
              </div>
              <div>
                <Label>To Wallet</Label>
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
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
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Amount</Label>
              <Input value={Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Fee ({item.asset})</Label>
              <Input
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
                type="number"
                step="any"
                min="0"
              />
            </div>
            <div>
              <Label>Asset</Label>
              <Input value={item.asset} disabled className="bg-muted" />
            </div>
          </div>

          {feeAmount > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-0.5">
              <div className="flex justify-between">
                <span>Transfer Amount:</span>
                <span>{transferAmount.toFixed(4)} {item.asset}</span>
              </div>
              <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                <span>Net Credited (To Wallet):</span>
                <span className="text-green-600">{transferAmount.toFixed(4)} {item.asset}</span>
              </div>
              <div className="flex justify-between">
                <span>Fee Deducted (From Source):</span>
                <span className="text-destructive">-{feeAmount.toFixed(4)} {item.asset}</span>
              </div>
              <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                <span>Total Source Debit:</span>
                <span>{(transferAmount + feeAmount).toFixed(4)} {item.asset}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || !selectedWalletId}
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
