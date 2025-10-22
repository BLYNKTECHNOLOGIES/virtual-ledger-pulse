import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddSubsidiaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const firmCompositionOptions = [
  { value: "SOLE_PROPRIETORSHIP", label: "Sole Proprietorship" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "TRUST", label: "Trust" },
  { value: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { value: "PUBLIC_LIMITED", label: "Public Limited Company" },
];

export function AddSubsidiaryDialog({ open, onOpenChange, onSuccess }: AddSubsidiaryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firm_name: "",
    firm_composition: "",
    gst_number: "",
    pan_number: "",
    registration_number: "",
    registered_address: "",
    city: "",
    state: "",
    pincode: "",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    date_of_incorporation: "",
    compliance_notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firm_name || !formData.firm_composition) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("subsidiaries").insert([
        {
          firm_name: formData.firm_name,
          firm_composition: formData.firm_composition,
          gst_number: formData.gst_number || null,
          pan_number: formData.pan_number || null,
          registration_number: formData.registration_number || null,
          registered_address: formData.registered_address || null,
          city: formData.city || null,
          state: formData.state || null,
          pincode: formData.pincode || null,
          contact_person: formData.contact_person || null,
          contact_email: formData.contact_email || null,
          contact_phone: formData.contact_phone || null,
          date_of_incorporation: formData.date_of_incorporation || null,
          compliance_notes: formData.compliance_notes || null,
        },
      ]);

      if (error) throw error;

      toast.success("Firm added successfully");
      setFormData({
        firm_name: "",
        firm_composition: "",
        gst_number: "",
        pan_number: "",
        registration_number: "",
        registered_address: "",
        city: "",
        state: "",
        pincode: "",
        contact_person: "",
        contact_email: "",
        contact_phone: "",
        date_of_incorporation: "",
        compliance_notes: "",
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding firm:", error);
      toast.error(error.message || "Failed to add firm");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Firm / Subsidiary</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="firm_name">Firm Name *</Label>
              <Input
                id="firm_name"
                value={formData.firm_name}
                onChange={(e) => setFormData({ ...formData, firm_name: e.target.value })}
                placeholder="Enter firm name"
                required
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="firm_composition">Firm Composition *</Label>
              <Select
                value={formData.firm_composition}
                onValueChange={(value) => setFormData({ ...formData, firm_composition: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select firm type" />
                </SelectTrigger>
                <SelectContent>
                  {firmCompositionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gst_number">GST Number</Label>
              <Input
                id="gst_number"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                placeholder="Enter GST number"
              />
            </div>

            <div>
              <Label htmlFor="pan_number">PAN Number</Label>
              <Input
                id="pan_number"
                value={formData.pan_number}
                onChange={(e) => setFormData({ ...formData, pan_number: e.target.value })}
                placeholder="Enter PAN number"
              />
            </div>

            <div>
              <Label htmlFor="registration_number">Registration Number</Label>
              <Input
                id="registration_number"
                value={formData.registration_number}
                onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                placeholder="Enter registration number"
              />
            </div>

            <div>
              <Label htmlFor="date_of_incorporation">Date of Incorporation</Label>
              <Input
                id="date_of_incorporation"
                type="date"
                value={formData.date_of_incorporation}
                onChange={(e) => setFormData({ ...formData, date_of_incorporation: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="registered_address">Registered Address</Label>
              <Textarea
                id="registered_address"
                value={formData.registered_address}
                onChange={(e) => setFormData({ ...formData, registered_address: e.target.value })}
                placeholder="Enter registered address"
              />
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Enter city"
              />
            </div>

            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="Enter state"
              />
            </div>

            <div>
              <Label htmlFor="pincode">Pincode</Label>
              <Input
                id="pincode"
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                placeholder="Enter pincode"
              />
            </div>

            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="Enter contact person"
              />
            </div>

            <div>
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="Enter contact email"
              />
            </div>

            <div>
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="Enter contact phone"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="compliance_notes">Compliance Notes</Label>
              <Textarea
                id="compliance_notes"
                value={formData.compliance_notes}
                onChange={(e) => setFormData({ ...formData, compliance_notes: e.target.value })}
                placeholder="Enter any compliance notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Firm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
