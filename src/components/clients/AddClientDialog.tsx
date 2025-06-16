
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddClientDialog({ open, onOpenChange }: AddClientDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    client_id: '',
    email: '',
    phone: '',
    client_type: '',
    risk_appetite: 'MEDIUM',
    kyc_status: 'PENDING',
    assigned_operator: '',
    buying_purpose: '',
    first_order_value: '',
    monthly_limit: '',
    current_month_used: '0',
    date_of_onboarding: undefined as Date | undefined,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('clients')
        .insert([{
          ...formData,
          first_order_value: formData.first_order_value ? Number(formData.first_order_value) : null,
          monthly_limit: formData.monthly_limit ? Number(formData.monthly_limit) : null,
          current_month_used: Number(formData.current_month_used),
          date_of_onboarding: formData.date_of_onboarding ? format(formData.date_of_onboarding, 'yyyy-MM-dd') : null,
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client created successfully!",
      });

      onOpenChange(false);
      setFormData({
        name: '',
        client_id: '',
        email: '',
        phone: '',
        client_type: '',
        risk_appetite: 'MEDIUM',
        kyc_status: 'PENDING',
        assigned_operator: '',
        buying_purpose: '',
        first_order_value: '',
        monthly_limit: '',
        current_month_used: '0',
        date_of_onboarding: undefined,
      });
      
      // Refresh the page to show new client
      window.location.reload();
    } catch (error) {
      console.error('Error creating client:', error);
      toast({
        title: "Error",
        description: "Failed to create client. Please try again.",
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
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="client_id">Client ID *</Label>
              <Input
                id="client_id"
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_type">Client Type *</Label>
              <Select value={formData.client_type} onValueChange={(value) => setFormData({ ...formData, client_type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="CORPORATE">Corporate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="risk_appetite">Risk Appetite</Label>
              <Select value={formData.risk_appetite} onValueChange={(value) => setFormData({ ...formData, risk_appetite: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="NO_RISK">No Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="kyc_status">KYC Status</Label>
              <Select value={formData.kyc_status} onValueChange={(value) => setFormData({ ...formData, kyc_status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="VERIFIED">Verified</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="assigned_operator">Assigned Operator</Label>
              <Input
                id="assigned_operator"
                value={formData.assigned_operator}
                onChange={(e) => setFormData({ ...formData, assigned_operator: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="buying_purpose">Buying Purpose</Label>
            <Input
              id="buying_purpose"
              value={formData.buying_purpose}
              onChange={(e) => setFormData({ ...formData, buying_purpose: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_order_value">First Order Value</Label>
              <Input
                id="first_order_value"
                type="number"
                value={formData.first_order_value}
                onChange={(e) => setFormData({ ...formData, first_order_value: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="monthly_limit">Monthly Limit</Label>
              <Input
                id="monthly_limit"
                type="number"
                value={formData.monthly_limit}
                onChange={(e) => setFormData({ ...formData, monthly_limit: e.target.value })}
              />
            </div>
          </div>

          <div>
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
                  {formData.date_of_onboarding ? format(formData.date_of_onboarding, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.date_of_onboarding}
                  onSelect={(date) => setFormData({ ...formData, date_of_onboarding: date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
