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
import { useQueryClient, useQuery } from "@tanstack/react-query";

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddClientDialog({ open, onOpenChange }: AddClientDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate client ID
  const generateClientId = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CL${timestamp}${random}`;
  };

  const [formData, setFormData] = useState({
    name: '',
    client_id: generateClientId(),
    email: '',
    phone: '',
    client_type: '',
    risk_appetite: 'MEDIUM',
    assigned_rm: '',
    selling_purpose: '',
    first_order_value: '',
    pan_card_number: '', // Optional Pan Card Number
    date_of_onboarding: new Date(),
  });

  // Simple input field for Assigned RM (similar to buyer form)
  // No need to query employees table

  const resetForm = () => {
    setFormData({
      name: '',
      client_id: generateClientId(),
      email: '',
      phone: '',
      client_type: '',
      risk_appetite: 'MEDIUM',
      assigned_rm: '',
      selling_purpose: '',
      first_order_value: '',
      
      pan_card_number: '',
      date_of_onboarding: new Date(),
    });
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required",
        variant: "destructive",
      });
      return false;
    }
    if (!formData.client_type) {
      toast({
        title: "Validation Error",
        description: "Client type is required",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('clients')
        .insert([{
          name: formData.name.trim(),
          client_id: formData.client_id.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          client_type: formData.client_type,
          risk_appetite: formData.risk_appetite,
          kyc_status: 'PENDING',
          assigned_operator: formData.assigned_rm.trim() || null,
          buying_purpose: formData.selling_purpose.trim() || null,
          first_order_value: formData.first_order_value ? Number(formData.first_order_value) : null,
          monthly_limit: null, // Sellers don't need monthly limits
          current_month_used: 0,
          date_of_onboarding: format(formData.date_of_onboarding, 'yyyy-MM-dd'),
          pan_card_number: formData.pan_card_number.trim() || null,
        }]);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: "Seller created successfully!",
      });

      // Refresh the clients list
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error creating seller:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create seller. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Seller</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name*</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                value={formData.client_id}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          {/* Email and Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
          </div>

          {/* Client Type and Risk Appetite */}
          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label htmlFor="risk_appetite">Risk Appetite</Label>
              <Select
                value={formData.risk_appetite}
                onValueChange={(value) => setFormData({ ...formData, risk_appetite: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          {/* Pan Card Number */}
          <div className="space-y-2">
            <Label htmlFor="pan_card_number">Pan Card Number</Label>
            <Input
              id="pan_card_number"
              value={formData.pan_card_number}
              onChange={(e) => setFormData({ ...formData, pan_card_number: e.target.value.toUpperCase() })}
              placeholder="Enter PAN card number (Optional)"
              maxLength={10}
            />
          </div>

          {/* Date of Onboarding */}
          <div className="space-y-2">
            <Label>Date of Onboarding</Label>
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
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating Seller..." : "Add Seller"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}