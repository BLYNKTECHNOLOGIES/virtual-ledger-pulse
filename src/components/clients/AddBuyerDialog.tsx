import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface AddBuyerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddBuyerDialog({ open, onOpenChange }: AddBuyerDialogProps) {
  const [formData, setFormData] = useState({
    client_name: '',
    contact_number: '',
    client_type: '',
    assigned_rm: '',
    selling_purpose: '',
    first_order_value: '',
    monthly_buying_volume: '',
    date_of_onboarding: new Date(),
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    try {
      // Generate a unique client ID
      const clientId = `CL${Date.now()}`;
      
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: formData.client_name,
          phone: formData.contact_number,
          client_type: formData.client_type,
          assigned_operator: formData.assigned_rm,
          buying_purpose: formData.selling_purpose,
          first_order_value: formData.first_order_value ? Number(formData.first_order_value) : null,
          monthly_limit: formData.monthly_buying_volume ? Number(formData.monthly_buying_volume) : null,
          date_of_onboarding: formData.date_of_onboarding.toISOString().split('T')[0],
          client_id: clientId,
          kyc_status: 'PENDING',
          risk_appetite: 'MEDIUM'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Buyer added successfully",
      });

      // Refresh the clients list
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error adding buyer:', error);
      toast({
        title: "Error",
        description: "Failed to add buyer. Please try again.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: '',
      contact_number: '',
      client_type: '',
      assigned_rm: '',
      selling_purpose: '',
      first_order_value: '',
      monthly_buying_volume: '',
      date_of_onboarding: new Date(),
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Buyer</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client Name */}
          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name*</Label>
            <Input
              id="client_name"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              placeholder="Enter client name"
            />
          </div>

          {/* Contact Number */}
          <div className="space-y-2">
            <Label htmlFor="contact_number">Contact Number*</Label>
            <Input
              id="contact_number"
              type="tel"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              placeholder="Enter contact number"
            />
          </div>

          {/* Client Type */}
          <div className="space-y-2">
            <Label htmlFor="client_type">Client Type*</Label>
            <Select
              value={formData.client_type}
              onValueChange={(value) => setFormData({ ...formData, client_type: value })}
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

          {/* Assigned RM */}
          <div className="space-y-2">
            <Label htmlFor="assigned_rm">Assigned RM</Label>
            <Input
              id="assigned_rm"
              value={formData.assigned_rm}
              onChange={(e) => setFormData({ ...formData, assigned_rm: e.target.value })}
              placeholder="Enter assigned relationship manager"
            />
          </div>

          {/* Selling Purpose */}
          <div className="space-y-2">
            <Label htmlFor="selling_purpose">Selling Purpose</Label>
            <Textarea
              id="selling_purpose"
              value={formData.selling_purpose}
              onChange={(e) => setFormData({ ...formData, selling_purpose: e.target.value })}
              placeholder="Enter selling purpose/reason"
              rows={3}
            />
          </div>

          {/* First Order Value */}
          <div className="space-y-2">
            <Label htmlFor="first_order_value">First Order Value</Label>
            <Input
              id="first_order_value"
              type="number"
              value={formData.first_order_value}
              onChange={(e) => setFormData({ ...formData, first_order_value: e.target.value })}
              placeholder="Enter first order value"
            />
          </div>

          {/* Monthly Buying Volume */}
          <div className="space-y-2">
            <Label htmlFor="monthly_buying_volume">Monthly Buying Volume*</Label>
            <Input
              id="monthly_buying_volume"
              type="number"
              value={formData.monthly_buying_volume}
              onChange={(e) => setFormData({ ...formData, monthly_buying_volume: e.target.value })}
              placeholder="Enter monthly buying volume"
            />
          </div>

          {/* Date of Onboarding */}
          <div className="space-y-2">
            <Label>Date of Onboarding*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.date_of_onboarding && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.date_of_onboarding ? (
                    format(formData.date_of_onboarding, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.date_of_onboarding}
                  onSelect={(date) => date && setFormData({ ...formData, date_of_onboarding: date })}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Add Buyer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}