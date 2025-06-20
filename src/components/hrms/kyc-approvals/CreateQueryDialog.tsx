
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Video } from "lucide-react";

interface CreateQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
}

export function CreateQueryDialog({ open, onOpenChange, kycRequest }: CreateQueryDialogProps) {
  const [vkycRequired, setVkycRequired] = useState(false);
  const [manualQuery, setManualQuery] = useState("");

  const handleSubmit = () => {
    const queryData = {
      kycRequestId: kycRequest?.id,
      vkycRequired,
      manualQuery: manualQuery.trim(),
    };
    
    console.log("Creating query:", queryData);
    onOpenChange(false);
  };

  if (!kycRequest) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Raise Query
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-sm font-medium">KYC Request for:</p>
            <p className="font-semibold">{kycRequest.counterpartyName}</p>
            <p className="text-sm text-gray-600">Amount: ₹{kycRequest.orderAmount?.toLocaleString()}</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="vkyc-required"
                checked={vkycRequired}
                onCheckedChange={setVkycRequired}
              />
              <Label htmlFor="vkyc-required" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Video KYC Required
              </Label>
            </div>

            <div>
              <Label htmlFor="manual-query">Manual Query</Label>
              <Textarea
                id="manual-query"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Describe what additional information or documents are required..."
                rows={4}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="flex-1"
              disabled={!vkycRequired && !manualQuery.trim()}
            >
              Raise Query
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
