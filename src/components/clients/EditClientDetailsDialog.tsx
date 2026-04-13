import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { checkPhoneUniqueness } from "@/utils/clientDuplicateCheck";

interface EditClientDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

export function EditClientDetailsDialog({ open, onOpenChange, client }: EditClientDetailsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch employees for RM dropdown
  const { data: employees } = useQuery({
    queryKey: ['hr_employees_rm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_employees')
        .select('id, first_name, last_name, badge_id')
        .eq('is_active', true)
        .order('first_name');
      
      if (error) throw error;
      return data?.map(e => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name || ''}`.trim(),
        employee_id: e.badge_id
      }));
    },
  });

  const [formData, setFormData] = useState({
    name: client?.name || "",
    phone: client?.phone || "",
    client_type: client?.client_type || "",
    risk_appetite: client?.risk_appetite || "",
    assigned_operator: client?.assigned_operator || "",
    buying_purpose: client?.buying_purpose || "",
    monthly_limit: client?.monthly_limit || "",
    operator_notes: client?.operator_notes || "",
    state: client?.state || "",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    setIsSubmitting(true);
    try {
      // Check phone uniqueness (skip if same as current or empty)
      const trimmedPhone = formData.phone?.trim();
      if (trimmedPhone && trimmedPhone.length >= 10) {
        const dupes = await checkPhoneUniqueness(trimmedPhone, client.id);
        if (dupes.length > 0) {
          toast({
            title: "Duplicate Phone Number",
            description: `This phone number is already assigned to: ${dupes.map(d => `${d.name} (${d.client_id})`).join(', ')}`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      const { error } = await supabase
        .from("clients")
        .update({
          name: formData.name,
          phone: formData.phone,
          client_type: formData.client_type,
          risk_appetite: formData.risk_appetite,
          assigned_operator: formData.assigned_operator,
          buying_purpose: formData.buying_purpose,
          monthly_limit: parseFloat(formData.monthly_limit) || null,
          operator_notes: formData.operator_notes,
          state: formData.state || null,
        })
        .eq("id", client.id);

      if (error) throw error;

      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_UPDATED,
        entityType: EntityTypes.CLIENT,
        entityId: client.id,
        module: Modules.CLIENTS,
        metadata: { client_name: formData.name }
      });

      toast({
        title: "Client Updated",
        description: "Client details have been updated successfully.",
      });

      queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating client:", error);
      toast({
        title: "Error",
        description: "Failed to update client details. Please try again.",
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
          <DialogTitle>Edit Client Details</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_type">Client Type</Label>
              <Select
                value={formData.client_type}
                onValueChange={(value) => handleInputChange("client_type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HNI">HNI</SelectItem>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk_appetite">Risk Appetite</Label>
              <Select
                value={formData.risk_appetite}
                onValueChange={(value) => handleInputChange("risk_appetite", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select risk appetite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREMIUM">Premium</SelectItem>
                  <SelectItem value="ESTABLISHED">Established</SelectItem>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="CAUTIOUS">Cautious</SelectItem>
                  <SelectItem value="HIGH_RISK">High Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_operator">Assigned RM</Label>
              <Select
                value={formData.assigned_operator}
                onValueChange={(value) => handleInputChange("assigned_operator", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship manager" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.name}>
                      {employee.name} ({employee.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthly_limit">Monthly Limit</Label>
              <Input
                id="monthly_limit"
                type="number"
                value={formData.monthly_limit}
                onChange={(e) => handleInputChange("monthly_limit", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="buying_purpose">Buying Purpose</Label>
              <Input
                id="buying_purpose"
                value={formData.buying_purpose}
                onChange={(e) => handleInputChange("buying_purpose", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select
                value={formData.state}
                onValueChange={(value) => handleInputChange("state", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES_AND_UTS.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operator_notes">Operator Notes</Label>
            <Textarea
              id="operator_notes"
              value={formData.operator_notes}
              onChange={(e) => handleInputChange("operator_notes", e.target.value)}
              rows={3}
            />
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
              {isSubmitting ? "Updating..." : "Update Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
