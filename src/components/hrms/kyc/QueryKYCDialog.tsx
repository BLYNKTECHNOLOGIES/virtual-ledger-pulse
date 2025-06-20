
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle } from "lucide-react";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
}

interface QueryKYCDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: KYCRequest | null;
  onSuccess: () => void;
}

export function QueryKYCDialog({ open, onOpenChange, request, onSuccess }: QueryKYCDialogProps) {
  const [vkycRequired, setVkycRequired] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleQuery = async () => {
    if (!request || (!vkycRequired && !manualQuery.trim())) {
      toast({
        title: "Error",
        description: "Please select VKYC required or provide a manual query",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      // Update KYC request status to QUERY
      const { error: updateError } = await supabase
        .from('kyc_approval_requests')
        .update({
          status: 'QUERY',
          review_date: new Date().toISOString()
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      // Create query record
      const { error: queryError } = await supabase
        .from('kyc_queries')
        .insert({
          kyc_request_id: request.id,
          query_type: vkycRequired ? 'VKYC_REQUIRED' : 'MANUAL_QUERY',
          vkyc_required: vkycRequired,
          manual_query_text: manualQuery.trim() || null
        });

      if (queryError) throw queryError;

      toast({
        title: "Success",
        description: "Query raised successfully",
      });

      setVkycRequired(false);
      setManualQuery('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error raising query:', error);
      toast({
        title: "Error",
        description: "Failed to raise query",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-600" />
            Raise Query for KYC Request
          </DialogTitle>
        </DialogHeader>

        {request && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-800">{request.counterparty_name}</h4>
              <p className="text-sm text-blue-700">
                Order Amount: ₹{request.order_amount.toLocaleString()}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="vkyc-required"
                  checked={vkycRequired}
                  onCheckedChange={(checked) => setVkycRequired(!!checked)}
                />
                <Label htmlFor="vkyc-required" className="text-sm font-medium">
                  Video KYC Required
                </Label>
              </div>

              <div>
                <Label htmlFor="manual-query">Manual Query</Label>
                <Textarea
                  id="manual-query"
                  placeholder="Describe what additional information or documentation is required..."
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleQuery}
                disabled={loading || (!vkycRequired && !manualQuery.trim())}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? 'Raising Query...' : 'Raise Query'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
