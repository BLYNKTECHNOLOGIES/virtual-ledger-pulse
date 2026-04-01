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
import { parseApprovalError } from "@/utils/approvalErrorParser";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { fetchAndLockMarketRate } from "@/lib/effectiveUsdtEngine";

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

  // Fetch asset-specific balances from wallet_asset_balances (non-USDT)
  const { data: assetBalances } = useQuery({
    queryKey: ["wallet_asset_balances", item.asset],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_asset_balances")
        .select("wallet_id, balance")
        .eq("asset_code", item.asset);
      if (error) throw error;
      return data || [];
    },
  });

  const getAssetBalance = (walletId: string) => {
    // Always use ledger balance from wallet_asset_balances (single source of truth)
    return Number(assetBalances?.find(b => b.wallet_id === walletId)?.balance ?? 0);
  };

  const mappedWallet = wallets?.find((w) => w.id === item.wallet_id);
  const mappedWalletName = mappedWallet?.wallet_name || "Binance Blynk";

  const fromWalletId = isDeposit ? selectedWalletId : item.wallet_id;
  const toWalletId = isDeposit ? item.wallet_id : selectedWalletId;
  const fromWalletLabel = isDeposit ? (wallets?.find(w => w.id === selectedWalletId)?.wallet_name || "—") : mappedWalletName;
  const toWalletLabel = isDeposit ? mappedWalletName : (wallets?.find(w => w.id === selectedWalletId)?.wallet_name || "—");

  const feeAmount = parseFloat(fee) || 0;
  const transferAmount = Number(item.amount);
  const sourceBalance = fromWalletId ? getAssetBalance(fromWalletId) : 0;
  // Fee is deducted from the transfer amount (not added on top) for on-chain transfers
  // The source wallet is debited only the transfer amount; fee reduces what the destination receives
  const totalRequired = transferAmount;
  const hasInsufficientBalance = fromWalletId ? sourceBalance < totalRequired : false;

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWalletId) throw new Error(isDeposit ? "Please select source wallet" : "Please select destination wallet");
      if (!fromWalletId || !toWalletId) throw new Error("Wallet not mapped");
      if (feeAmount < 0) throw new Error("Fee cannot be negative");
      if (feeAmount >= transferAmount) throw new Error("Fee cannot exceed transfer amount");
      if (sourceBalance < transferAmount) {
        throw new Error(`Insufficient ${item.asset} balance in source wallet. Available: ${sourceBalance.toFixed(4)}, Required: ${transferAmount.toFixed(4)}`);
      }

      const refId = globalThis.crypto?.randomUUID?.() ?? null;

      // Fetch and lock market rate for USDT valuation on wallet transactions
      const locked = await fetchAndLockMarketRate(item.asset, { entryType: 'transfer' });
      const mktRate = locked.price;
      const usdtQtyDebit = transferAmount * mktRate;
      const usdtQtyCredit = (transferAmount - feeAmount) * mktRate;

      // Insert transfer transactions — triggers handle balance updates
      const transactions: any[] = [
        {
          wallet_id: fromWalletId,
          transaction_type: "DEBIT",
          amount: transferAmount,
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer to ${toWalletLabel} (${item.movement_type} reconciliation)${feeAmount > 0 ? ` | Network fee: ${feeAmount.toFixed(6)} ${item.asset}` : ''}`,
          market_rate_usdt: mktRate,
          effective_usdt_qty: usdtQtyDebit,
          effective_usdt_rate: null,
          price_snapshot_id: locked.snapshotId || null,
        },
        {
          wallet_id: toWalletId,
          transaction_type: "CREDIT",
          amount: transferAmount - feeAmount, // Net of network fee
          asset_code: item.asset,
          reference_type: "WALLET_TRANSFER",
          reference_id: refId,
          description: `ERP Action: Transfer from ${fromWalletLabel} (${item.movement_type} reconciliation)${feeAmount > 0 ? ` | Net after ${feeAmount.toFixed(6)} ${item.asset} network fee` : ''}`,
          market_rate_usdt: mktRate,
          effective_usdt_qty: usdtQtyCredit,
          effective_usdt_rate: null,
          price_snapshot_id: locked.snapshotId || null,
        },
      ];

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
      const { title, description } = parseApprovalError(err, 'Wallet Transfer');
      toast({ title, description, variant: "destructive" });
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
                          {w.wallet_name} — {getAssetBalance(w.id).toFixed(4)} {item.asset}
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
                          {w.wallet_name} — {getAssetBalance(w.id).toFixed(4)} {item.asset}
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
                <span className="text-green-600">{(transferAmount - feeAmount).toFixed(4)} {item.asset}</span>
              </div>
              <div className="flex justify-between">
                <span>Fee Deducted (From Source):</span>
                <span className="text-destructive">-{feeAmount.toFixed(4)} {item.asset}</span>
              </div>
              <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                <span>Total Source Debit:</span>
                <span>{transferAmount.toFixed(4)} {item.asset}</span>
              </div>
            </div>
          )}

          {hasInsufficientBalance && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Insufficient {item.asset} balance in source wallet. Available: {sourceBalance.toFixed(4)}, Required: {transferAmount.toFixed(4)}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending}
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
