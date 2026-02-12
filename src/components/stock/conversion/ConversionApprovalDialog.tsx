
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useRejectConversion, ConversionRecord } from "@/hooks/useProductConversions";

interface Props {
  record: ConversionRecord | null;
  onClose: () => void;
}

export function ConversionApprovalDialog({ record, onClose }: Props) {
  const [reason, setReason] = useState("");
  const rejectMutation = useRejectConversion();

  const handleReject = () => {
    if (!record) return;
    rejectMutation.mutate(
      { conversionId: record.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setReason("");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Conversion</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Rejecting <span className="font-mono font-medium">{record?.reference_no}</span> — {record?.side} {record?.quantity} {record?.asset_code}
          </p>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? "Rejecting..." : "Reject Conversion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
