
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
    buying_purpose: '',
    first_order_value: '',
    monthly_limit: '',
    current_month_used: '0',
    date_of_onboarding: new Date(),
    // KYC Documents
    pan_card_file: null as File | null,
    aadhar_front_file: null as File | null,
    aadhar_back_file: null as File | null,
    other_docs_files: [] as File[],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      client_id: generateClientId(),
      email: '',
      phone: '',
      client_type: '',
      risk_appetite: 'MEDIUM',
      assigned_rm: '',
      buying_purpose: '',
      first_order_value: '',
      monthly_limit: '',
      current_month_used: '0',
      date_of_onboarding: new Date(),
      // KYC Documents
      pan_card_file: null,
      aadhar_front_file: null,
      aadhar_back_file: null,
      other_docs_files: [],
    });
  };

  const uploadFile = async (file: File, bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    
    if (error) throw error;
    return data.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error("Client name is required");
      }
      if (!formData.client_type) {
        throw new Error("Client type is required");
      }
      if (!formData.pan_card_file) {
        throw new Error("PAN Card is required");
      }
      if (!formData.aadhar_front_file) {
        throw new Error("Aadhar Card (Front) is required");
      }
      if (!formData.aadhar_back_file) {
        throw new Error("Aadhar Card (Back) is required");
      }

      // Upload KYC documents
      let panCardUrl = null;
      let aadharFrontUrl = null;
      let aadharBackUrl = null;
      let otherDocsUrls: string[] = [];

      if (formData.pan_card_file) {
        const panPath = `clients/${formData.client_id}/pan_card_${Date.now()}.${formData.pan_card_file.name.split('.').pop()}`;
        panCardUrl = await uploadFile(formData.pan_card_file, 'kyc-documents', panPath);
      }

      if (formData.aadhar_front_file) {
        const aadharFrontPath = `clients/${formData.client_id}/aadhar_front_${Date.now()}.${formData.aadhar_front_file.name.split('.').pop()}`;
        aadharFrontUrl = await uploadFile(formData.aadhar_front_file, 'kyc-documents', aadharFrontPath);
      }

      if (formData.aadhar_back_file) {
        const aadharBackPath = `clients/${formData.client_id}/aadhar_back_${Date.now()}.${formData.aadhar_back_file.name.split('.').pop()}`;
        aadharBackUrl = await uploadFile(formData.aadhar_back_file, 'kyc-documents', aadharBackPath);
      }

      // Upload other documents
      for (let i = 0; i < formData.other_docs_files.length; i++) {
        const file = formData.other_docs_files[i];
        const otherDocPath = `clients/${formData.client_id}/other_doc_${i}_${Date.now()}.${file.name.split('.').pop()}`;
        const url = await uploadFile(file, 'kyc-documents', otherDocPath);
        otherDocsUrls.push(url);
      }

      const { error } = await supabase
        .from('clients')
        .insert([{
          name: formData.name.trim(),
          client_id: formData.client_id.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          client_type: formData.client_type,
          risk_appetite: formData.risk_appetite,
          kyc_status: 'VERIFIED', // Auto-set to VERIFIED since KYC is already done
          assigned_operator: formData.assigned_rm.trim() || null,
          buying_purpose: formData.buying_purpose.trim() || null,
          first_order_value: formData.first_order_value ? Number(formData.first_order_value) : null,
          monthly_limit: formData.monthly_limit ? Number(formData.monthly_limit) : null,
          current_month_used: Number(formData.current_month_used) || 0,
          date_of_onboarding: format(formData.date_of_onboarding, 'yyyy-MM-dd'),
          pan_card_url: panCardUrl,
          aadhar_front_url: aadharFrontUrl,
          aadhar_back_url: aadharBackUrl,
          other_documents_urls: otherDocsUrls.length > 0 ? otherDocsUrls : null,
        }]);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: "Client created successfully!",
      });

      onOpenChange(false);
      resetForm();
      
      // Refresh the page to show new client
      window.location.reload();
    } catch (error: any) {
      console.error('Error creating client:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

          {/* KYC Documents Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-900">KYC Documents</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pan_card">PAN Card *</Label>
                <Input
                  id="pan_card"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormData({ ...formData, pan_card_file: file });
                  }}
                  required
                />
                {formData.pan_card_file && (
                  <p className="text-sm text-green-600 mt-1">✓ {formData.pan_card_file.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="aadhar_front">Aadhar Card (Front) *</Label>
                <Input
                  id="aadhar_front"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormData({ ...formData, aadhar_front_file: file });
                  }}
                  required
                />
                {formData.aadhar_front_file && (
                  <p className="text-sm text-green-600 mt-1">✓ {formData.aadhar_front_file.name}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="aadhar_back">Aadhar Card (Back) *</Label>
                <Input
                  id="aadhar_back"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormData({ ...formData, aadhar_back_file: file });
                  }}
                  required
                />
                {formData.aadhar_back_file && (
                  <p className="text-sm text-green-600 mt-1">✓ {formData.aadhar_back_file.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="other_docs">Other Documents</Label>
                <Input
                  id="other_docs"
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setFormData({ ...formData, other_docs_files: files });
                  }}
                />
                {formData.other_docs_files.length > 0 && (
                  <div className="text-sm text-green-600 mt-1">
                    ✓ {formData.other_docs_files.length} file(s) selected
                  </div>
                )}
              </div>
            </div>
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
