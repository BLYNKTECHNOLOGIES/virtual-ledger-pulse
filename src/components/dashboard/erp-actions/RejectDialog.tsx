import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useRejectQueueItem, ErpActionQueueItem } from "@/hooks/useErpActionQueue";
import { useToast } from "@/hooks/use-toast";

interface RejectDialogProps {
  item: ErpActionQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RejectDialog({ item, open, onOpenChange }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const rejectMutation = useRejectQueueItem();
  const { toast } = useToast();

  const handleReject = () => {
    if (!item) return;
    rejectMutation.mutate(
      { id: item.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: "Rejected", description: "Movement archived as rejected." });
          setReason("");
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reject Movement</DialogTitle>
          <DialogDescription>
            This will archive the {item?.movement_type} of {item?.amount} {item?.asset} and remove it from the action queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being rejected..."
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="flex-1"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
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
