import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, ShoppingCart, DollarSign } from "lucide-react";
import { ErpActionQueueItem, useProcessQueueItem } from "@/hooks/useErpActionQueue";
import { PurchaseEntryWrapper } from "./PurchaseEntryWrapper";
import { SalesEntryWrapper } from "./SalesEntryWrapper";
import { WalletTransferWrapper } from "./WalletTransferWrapper";

interface ActionSelectionDialogProps {
  item: ErpActionQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SubDialogType = "purchase" | "sales" | "transfer" | null;

export function ActionSelectionDialog({ item, open, onOpenChange }: ActionSelectionDialogProps) {
  const [subDialog, setSubDialog] = useState<SubDialogType>(null);
  const processQueueItem = useProcessQueueItem();

  const handleClose = () => {
    setSubDialog(null);
    onOpenChange(false);
  };

  const handleProcessed = (actionType: string, erpReferenceId?: string) => {
    if (!item) return;
    processQueueItem.mutate(
      { id: item.id, actionType, erpReferenceId },
      { onSuccess: handleClose }
    );
  };

  if (!item) return null;

  const isDeposit = item.movement_type === "deposit";

  return (
    <>
      <Dialog open={open && !subDialog} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isDeposit ? "Deposit" : "Withdrawal"} Entry — {item.amount} {item.asset}
            </DialogTitle>
            <DialogDescription>
              Choose how to record this {item.movement_type} in ERP
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => setSubDialog("transfer")}
            >
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              <div className="text-left">
                <div className="font-medium">Wallet Transfer</div>
                <div className="text-xs text-muted-foreground">Internal movement between wallets</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-14"
              onClick={() => setSubDialog(isDeposit ? "purchase" : "sales")}
            >
              {isDeposit ? (
                <ShoppingCart className="h-5 w-5 text-green-600" />
              ) : (
                <DollarSign className="h-5 w-5 text-amber-600" />
              )}
              <div className="text-left">
                <div className="font-medium">{isDeposit ? "Purchase Entry" : "Sales Entry"}</div>
                <div className="text-xs text-muted-foreground">
                  {isDeposit ? "Record as asset procurement" : "Record as asset sale"}
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      {subDialog === "purchase" && (
        <PurchaseEntryWrapper
          item={item}
          open={true}
          onOpenChange={(o) => { if (!o) setSubDialog(null); }}
          onSuccess={(refId) => handleProcessed("PURCHASE", refId)}
        />
      )}

      {subDialog === "sales" && (
        <SalesEntryWrapper
          item={item}
          open={true}
          onOpenChange={(o) => { if (!o) setSubDialog(null); }}
          onSuccess={(refId) => handleProcessed("SALE", refId)}
        />
      )}

      {subDialog === "transfer" && (
        <WalletTransferWrapper
          item={item}
          open={true}
          onOpenChange={(o) => { if (!o) setSubDialog(null); }}
          onSuccess={() => handleProcessed("WALLET_TRANSFER")}
        />
      )}
    </>
  );
}
