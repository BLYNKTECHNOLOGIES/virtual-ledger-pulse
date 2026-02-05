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
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_id')
        .eq('status', 'ACTIVE')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState({
    name: client?.name || "",
    email: client?.email || "",
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
      const { error } = await supabase
        .from("clients")
        .update({
          name: formData.name,
          email: formData.email,
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

      // Log the action
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

      // Invalidate queries to refresh data
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
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
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
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