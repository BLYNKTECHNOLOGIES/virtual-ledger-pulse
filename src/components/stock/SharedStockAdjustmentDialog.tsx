import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAssetCodes } from "@/hooks/useAssetCodes";
import {
  fetchActiveWalletsWithLedgerAssetBalance,
  fetchWalletLedgerAssetBalance,
} from "@/lib/wallet-ledger-balance";
import {
  getCurrentUserId,
  logActionWithCurrentUser,
  ActionTypes,
  EntityTypes,
  Modules,
} from "@/lib/system-action-logger";

interface SharedStockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Single shared "Manual Stock Adjustment" dialog (TRANSFER / CREDIT / DEBIT +
 * optional transfer fee). This is the MORE COMPLETE of the two former dialogs;
 * the mutation payload is byte-identical to the original inline StockTransactionsTab
 * implementation. Used by both the Ledger and Wallets tabs.
 */
export function SharedStockAdjustmentDialog({ open, onOpenChange }: SharedStockAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adjustmentData, setAdjustmentData] = useState({
    fromWallet: "",
    toWallet: "",
    amount: "",
    description: "",
    transactionType: "TRANSFER",
    transferFee: "",
    assetCode: "USDT",
  });

  const { data: wallets } = useQuery({
    queryKey: ["wallets_with_asset_balance", adjustmentData.assetCode],
    queryFn: async () => {
      return fetchActiveWalletsWithLedgerAssetBalance(
        adjustmentData.assetCode,
        "id, wallet_name, wallet_type, chain_name, current_balance, fee_percentage, is_fee_enabled"
      );
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const { data: assetCodes } = useAssetCodes();

  const manualAdjustmentMutation = useMutation({
    mutationFn: async (adjustmentData: any) => {
      const amount = parseFloat(adjustmentData.amount);
      const transferFee = parseFloat(adjustmentData.transferFee) || 0;
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const createdByUserId = isValidUuid ? rawUserId : null;

      const transferRefId = globalThis.crypto?.randomUUID?.() ?? null;

      if (adjustmentData.transactionType === "TRANSFER") {
        const totalDeduction = amount + transferFee;
        const sourceWalletName = wallets?.find((wallet) => wallet.id === adjustmentData.fromWallet)?.wallet_name || "source wallet";
        const sourceWalletBalance = await fetchWalletLedgerAssetBalance(adjustmentData.fromWallet, adjustmentData.assetCode);

        if (sourceWalletBalance < totalDeduction) {
          throw new Error(
            `Insufficient balance in ${sourceWalletName}. Required: ${totalDeduction.toFixed(4)} ${adjustmentData.assetCode}, Available: ${sourceWalletBalance.toFixed(4)} ${adjustmentData.assetCode}`
          );
        }

        const { error: debitError } = await supabase
          .from("wallet_transactions")
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: "TRANSFER_OUT",
            amount: amount,
            asset_code: adjustmentData.assetCode,
            reference_type: "MANUAL_TRANSFER",
            reference_id: transferRefId,
            description: `Transfer to another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} ${adjustmentData.assetCode})` : ""}: ${adjustmentData.description}`,
            balance_before: 0,
            balance_after: 0,
            created_by: createdByUserId,
          });

        if (debitError) throw debitError;

        const { error: creditError } = await supabase
          .from("wallet_transactions")
          .insert({
            wallet_id: adjustmentData.toWallet,
            transaction_type: "TRANSFER_IN",
            amount: amount,
            asset_code: adjustmentData.assetCode,
            reference_type: "MANUAL_TRANSFER",
            reference_id: transferRefId,
            description: `Transfer from another wallet${transferFee > 0 ? ` (Fee: ${transferFee.toFixed(4)} ${adjustmentData.assetCode} deducted from sender)` : ""}: ${adjustmentData.description}`,
            balance_before: 0,
            balance_after: 0,
            created_by: createdByUserId,
          });

        if (creditError) throw creditError;

        if (transferFee > 0) {
          const { error: feeError } = await supabase
            .from("wallet_transactions")
            .insert({
              wallet_id: adjustmentData.fromWallet,
              transaction_type: "DEBIT",
              amount: transferFee,
              asset_code: adjustmentData.assetCode,
              reference_type: "TRANSFER_FEE",
              reference_id: transferRefId,
              description: `Transfer fee for wallet-to-wallet transfer: ${adjustmentData.description}`,
              balance_before: 0,
              balance_after: 0,
              created_by: createdByUserId,
            });

          if (feeError) throw feeError;
        }
      } else {
        const { error } = await supabase
          .from("wallet_transactions")
          .insert({
            wallet_id: adjustmentData.fromWallet,
            transaction_type: adjustmentData.transactionType,
            amount: amount,
            asset_code: adjustmentData.assetCode,
            reference_type: "MANUAL_ADJUSTMENT",
            reference_id: null,
            description: adjustmentData.description,
            balance_before: 0,
            balance_after: 0,
            created_by: createdByUserId,
          });

        if (error) throw error;
      }

      return { adjustmentData };
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: ActionTypes.STOCK_WALLET_ADJUSTED,
        entityType: EntityTypes.WALLET,
        entityId: variables.fromWallet,
        module: Modules.STOCK,
        metadata: {
          adjustment_type: variables.transactionType,
          amount: variables.amount,
          description: variables.description,
          to_wallet: variables.toWallet || null,
          transfer_fee: variables.transferFee || null,
        },
      });

      toast({
        title: "Success",
        description: "Manual stock adjustment completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions_live"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_asset_balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_asset_balances_summary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
      setAdjustmentData({
        fromWallet: "",
        toWallet: "",
        amount: "",
        description: "",
        transactionType: "TRANSFER",
        transferFee: "",
        assetCode: "USDT",
      });
    },
    onError: (error: any) => {
      console.error("❌ Manual adjustment failed:", error);
      const message =
        error?.message ||
        error?.details ||
        error?.hint ||
        (typeof error === "string" ? error : null) ||
        "Failed to complete manual adjustment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manual Stock Adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Transaction Type</Label>
            <Select
              value={adjustmentData.transactionType}
              onValueChange={(value) => setAdjustmentData((prev) => ({ ...prev, transactionType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSFER">Transfer Between Wallets</SelectItem>
                <SelectItem value="CREDIT">Add Stock (Credit)</SelectItem>
                <SelectItem value="DEBIT">Remove Stock (Debit)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Asset Type *</Label>
            <Select
              value={adjustmentData.assetCode}
              onValueChange={(value) => setAdjustmentData((prev) => ({ ...prev, assetCode: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                {(assetCodes || ["USDT"]).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>From Wallet {adjustmentData.transactionType !== "CREDIT" ? "*" : ""}</Label>
            <Select
              value={adjustmentData.fromWallet}
              onValueChange={(value) => setAdjustmentData((prev) => ({ ...prev, fromWallet: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets?.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.wallet_name} - {Number(wallet.current_balance || 0).toFixed(4)} {adjustmentData.assetCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {adjustmentData.transactionType === "TRANSFER" && (
            <div className="space-y-2">
              <Label>To Wallet *</Label>
              <Select
                value={adjustmentData.toWallet}
                onValueChange={(value) => setAdjustmentData((prev) => ({ ...prev, toWallet: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets?.filter((w) => w.id !== adjustmentData.fromWallet).map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} - {Number(wallet.current_balance || 0).toFixed(4)} {adjustmentData.assetCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Enter amount"
              value={adjustmentData.amount}
              onChange={(e) => setAdjustmentData((prev) => ({ ...prev, amount: e.target.value }))}
            />
          </div>

          {adjustmentData.transactionType === "TRANSFER" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Transfer Fee (USDT)
                <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Enter fee amount (optional)"
                value={adjustmentData.transferFee}
                onChange={(e) => setAdjustmentData((prev) => ({ ...prev, transferFee: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Enter reason for adjustment"
              value={adjustmentData.description}
              onChange={(e) => setAdjustmentData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          {adjustmentData.transactionType === "TRANSFER" && adjustmentData.fromWallet && adjustmentData.amount && (
            <div className="border rounded-lg p-3 bg-muted/50 space-y-2 text-sm">
              <div className="font-medium text-foreground">Transfer Summary</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transfer Amount:</span>
                <span>{parseFloat(adjustmentData.amount || "0").toFixed(4)} {adjustmentData.assetCode}</span>
              </div>
              {parseFloat(adjustmentData.transferFee || "0") > 0 && (
                <div className="flex justify-between text-warning">
                  <span>Fee (deducted from sender):</span>
                  <span>{parseFloat(adjustmentData.transferFee || "0").toFixed(4)} {adjustmentData.assetCode}</span>
                </div>
              )}
              <div className="flex justify-between font-medium border-t pt-2 mt-2">
                <span>Total Deducted from Sender:</span>
                <span>{(parseFloat(adjustmentData.amount || "0") + parseFloat(adjustmentData.transferFee || "0")).toFixed(4)} {adjustmentData.assetCode}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Receiver Gets:</span>
                <span>{parseFloat(adjustmentData.amount || "0").toFixed(4)} {adjustmentData.assetCode}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (
                  !adjustmentData.fromWallet ||
                  !adjustmentData.amount ||
                  (adjustmentData.transactionType === "TRANSFER" && !adjustmentData.toWallet)
                ) {
                  toast({
                    title: "Validation Error",
                    description: "Please fill in all required fields",
                    variant: "destructive",
                  });
                  return;
                }
                manualAdjustmentMutation.mutate(adjustmentData);
              }}
              disabled={manualAdjustmentMutation.isPending}
              className="bg-info hover:bg-info/90"
            >
              {manualAdjustmentMutation.isPending ? "Processing..." : "Submit Adjustment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
