
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
  onSuccess?: () => void;
}

export function CreateQueryDialog({ open, onOpenChange, kycRequest, onSuccess }: CreateQueryDialogProps) {
  const [vkycRequired, setVkycRequired] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!vkycRequired && !manualQuery.trim()) {
      toast({
        title: "Query Required",
        description: "Please either check VKYC required or enter a manual query.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Create the query
      const { error: queryError } = await supabase
        .from('kyc_queries')
        .insert({
          kyc_request_id: kycRequest?.id,
          vkyc_required: vkycRequired,
          manual_query: manualQuery.trim() || null,
        });

      if (queryError) {
        throw queryError;
      }

      // Update the KYC request status to QUERIED
      const { error: updateError } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'QUERIED' })
        .eq('id', kycRequest?.id);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Query Raised",
        description: "Query has been raised successfully for this KYC request.",
      });

      // Reset form
      setVkycRequired(false);
      setManualQuery("");
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating query:', error);
      toast({
        title: "Error",
        description: "Failed to raise query. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
            <p className="font-semibold">{kycRequest.counterparty_name}</p>
            <p className="text-sm text-gray-600">Amount: ₹{kycRequest.order_amount?.toLocaleString()}</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="vkyc-required"
                checked={vkycRequired}
                onCheckedChange={(checked) => {
                  if (checked !== "indeterminate") {
                    setVkycRequired(checked);
                  }
                }}
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
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="flex-1"
              disabled={(!vkycRequired && !manualQuery.trim()) || isSubmitting}
            >
              {isSubmitting ? "Raising Query..." : "Raise Query"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
