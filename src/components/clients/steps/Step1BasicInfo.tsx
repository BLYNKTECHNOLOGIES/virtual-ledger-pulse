import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Step1BasicInfoProps {
  formData: any;
  setFormData: (data: any) => void;
}

export function Step1BasicInfo({ formData, setFormData }: Step1BasicInfoProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Client Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Enter client name"
          />
        </div>
        
        <div>
          <Label htmlFor="client_id">Client ID</Label>
          <Input
            id="client_id"
            value={formData.client_id}
            disabled
            className="bg-gray-50"
            placeholder="Auto-generated"
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
            placeholder="Enter email address"
          />
        </div>
        
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="Enter phone number"
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

      <div>
        <Label htmlFor="assigned_rm">Assigned RM</Label>
        <Input
          id="assigned_rm"
          value={formData.assigned_rm}
          onChange={(e) => setFormData({ ...formData, assigned_rm: e.target.value })}
          placeholder="Enter relationship manager name"
        />
      </div>

      <div>
        <Label htmlFor="buying_purpose">Buying Purpose</Label>
        <Input
          id="buying_purpose"
          value={formData.buying_purpose}
          onChange={(e) => setFormData({ ...formData, buying_purpose: e.target.value })}
          placeholder="Enter buying purpose"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_order_value">First Order Value</Label>
          <Input
            id="first_order_value"
            type="number"
            min="0"
            step="0.01"
            value={formData.first_order_value}
            onChange={(e) => setFormData({ ...formData, first_order_value: e.target.value })}
            placeholder="Enter first order value"
          />
        </div>
        
        <div>
          <Label htmlFor="monthly_limit">Monthly Limit</Label>
          <Input
            id="monthly_limit"
            type="number"
            min="0"
            step="0.01"
            value={formData.monthly_limit}
            onChange={(e) => setFormData({ ...formData, monthly_limit: e.target.value })}
            placeholder="Enter monthly limit"
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
              onSelect={(date) => setFormData({ ...formData, date_of_onboarding: date || new Date() })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}