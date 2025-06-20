
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

interface CreateKYCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateKYCRequestDialog({ open, onOpenChange, onSuccess }: CreateKYCRequestDialogProps) {
  const [formData, setFormData] = useState({
    counterparty_name: '',
    order_amount: '',
    purpose_of_buying: '',
    additional_info: ''
  });
  const [files, setFiles] = useState({
    aadhar_front: null as File | null,
    aadhar_back: null as File | null,
    verified_feedback: null as File | null,
    negative_feedback: null as File | null
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Upload files if present
      const uploadPromises = [];
      const fileUrls: any = {};

      if (files.aadhar_front) {
        uploadPromises.push(
          supabase.storage
            .from('kyc-documents')
            .upload(`aadhar-front-${Date.now()}`, files.aadhar_front)
            .then(({ data }) => {
              if (data) fileUrls.aadhar_front_image_url = data.path;
            })
        );
      }

      if (files.aadhar_back) {
        uploadPromises.push(
          supabase.storage
            .from('kyc-documents')
            .upload(`aadhar-back-${Date.now()}`, files.aadhar_back)
            .then(({ data }) => {
              if (data) fileUrls.aadhar_back_image_url = data.path;
            })
        );
      }

      if (files.verified_feedback) {
        uploadPromises.push(
          supabase.storage
            .from('kyc-documents')
            .upload(`verified-feedback-${Date.now()}`, files.verified_feedback)
            .then(({ data }) => {
              if (data) fileUrls.verified_feedback_screenshot_url = data.path;
            })
        );
      }

      if (files.negative_feedback) {
        uploadPromises.push(
          supabase.storage
            .from('kyc-documents')
            .upload(`negative-feedback-${Date.now()}`, files.negative_feedback)
            .then(({ data }) => {
              if (data) fileUrls.negative_feedback_screenshot_url = data.path;
            })
        );
      }

      await Promise.all(uploadPromises);

      // Create KYC request
      const { error } = await supabase
        .from('kyc_approval_requests')
        .insert({
          counterparty_name: formData.counterparty_name,
          order_amount: parseFloat(formData.order_amount),
          purpose_of_buying: formData.purpose_of_buying,
          additional_info: formData.additional_info,
          ...fileUrls
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "KYC request created successfully",
      });

      setFormData({
        counterparty_name: '',
        order_amount: '',
        purpose_of_buying: '',
        additional_info: ''
      });
      setFiles({
        aadhar_front: null,
        aadhar_back: null,
        verified_feedback: null,
        negative_feedback: null
      });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error creating KYC request:', error);
      toast({
        title: "Error",
        description: "Failed to create KYC request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (field: string, file: File | null) => {
    setFiles(prev => ({ ...prev, [field]: file }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New KYC Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="counterparty_name">Counterparty Name *</Label>
              <Input
                id="counterparty_name"
                value={formData.counterparty_name}
                onChange={(e) => setFormData(prev => ({ ...prev, counterparty_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="order_amount">Order Amount *</Label>
              <Input
                id="order_amount"
                type="number"
                value={formData.order_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, order_amount: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="purpose_of_buying">Purpose of Buying</Label>
            <Input
              id="purpose_of_buying"
              value={formData.purpose_of_buying}
              onChange={(e) => setFormData(prev => ({ ...prev, purpose_of_buying: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Aadhar Front Image</Label>
              <div className="mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('aadhar_front', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
            <div>
              <Label>Aadhar Back Image</Label>
              <div className="mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('aadhar_back', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Verified Feedback Screenshot</Label>
              <div className="mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('verified_feedback', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
            <div>
              <Label>Negative Feedback Screenshot</Label>
              <div className="mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('negative_feedback', e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="additional_info">Additional Information</Label>
            <Textarea
              id="additional_info"
              value={formData.additional_info}
              onChange={(e) => setFormData(prev => ({ ...prev, additional_info: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Request'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
