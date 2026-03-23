import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface RequestLimitIncreaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

export function RequestLimitIncreaseDialog({ open, onOpenChange, client }: RequestLimitIncreaseDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    currentLimit: client?.monthly_limit || 0,
    requestedLimit: "",
    justification: "",
    expectedUsage: "",
    riskAssessment: "",
  });

  const increasePecentage = formData.requestedLimit && formData.currentLimit 
    ? (((parseFloat(formData.requestedLimit) - formData.currentLimit) / formData.currentLimit) * 100).toFixed(1)
    : "0";

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    const newLimit = parseFloat(formData.requestedLimit);
    if (isNaN(newLimit) || newLimit <= 0) {
      toast({ title: "Invalid limit", description: "Please enter a valid limit amount.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save the request record for audit trail
      const { error: insertError } = await supabase
        .from('client_limit_requests' as any)
        .insert({
          client_id: client.id,
          client_name: client.name,
          previous_limit: formData.currentLimit,
          requested_limit: newLimit,
          increase_percentage: parseFloat(increasePecentage),
          justification: formData.justification || null,
          expected_usage: formData.expectedUsage || null,
          risk_assessment: formData.riskAssessment || null,
          status: 'APPROVED',
        });

      if (insertError) throw insertError;

      // 2. Update the client's monthly_limit
      const { error: updateError } = await supabase
        .from('clients')
        .update({ monthly_limit: newLimit })
        .eq('id', client.id);

      if (updateError) throw updateError;

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['client', client.id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });

      toast({
        title: "Limit Updated",
        description: `Monthly limit updated to ₹${newLimit.toLocaleString()} for ${client.name}.`,
      });

      onOpenChange(false);
      
      setFormData({
        currentLimit: newLimit,
        requestedLimit: "",
        justification: "",
        expectedUsage: "",
        riskAssessment: "",
      });
    } catch (error) {
      console.error("Error updating limit:", error);
      toast({
        title: "Error",
        description: "Failed to update limit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Request Limit Increase - {client?.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Current Monthly Limit</Label>
                <p className="text-2xl font-bold text-blue-600">₹{formData.currentLimit.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Current Month Used</Label>
                <p className="text-2xl font-bold text-green-600">₹{client?.current_month_used?.toLocaleString() || '0'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requestedLimit">Requested New Limit (₹)</Label>
              <Input
                id="requestedLimit"
                type="number"
                value={formData.requestedLimit}
                onChange={(e) => handleInputChange("requestedLimit", e.target.value)}
                placeholder="Enter new limit amount"
                required
              />
              {formData.requestedLimit && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calculator className="h-4 w-4" />
                  <span>Increase: {increasePecentage}% (₹{(parseFloat(formData.requestedLimit) - formData.currentLimit).toLocaleString()})</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="justification">Business Justification</Label>
              <Textarea
                id="justification"
                value={formData.justification}
                onChange={(e) => handleInputChange("justification", e.target.value)}
                placeholder="Explain why this limit increase is needed..."
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedUsage">Expected Monthly Usage</Label>
              <Textarea
                id="expectedUsage"
                value={formData.expectedUsage}
                onChange={(e) => handleInputChange("expectedUsage", e.target.value)}
                placeholder="Describe expected trading patterns and usage..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="riskAssessment">Risk Assessment</Label>
              <Textarea
                id="riskAssessment"
                value={formData.riskAssessment}
                onChange={(e) => handleInputChange("riskAssessment", e.target.value)}
                placeholder="Any additional risk factors or mitigations..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Limit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}