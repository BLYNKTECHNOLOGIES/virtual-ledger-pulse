
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, User, DollarSign, FileText, Plus, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateKYCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateKYCRequestDialog({ open, onOpenChange, onSuccess }: CreateKYCRequestDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    counterpartyName: "",
    orderAmount: "",
    purposeOfBuying: "",
    additionalInfo: "",
    aadharFrontFile: null as File | null,
    aadharBackFile: null as File | null,
    verifiedFeedbackFile: null as File | null,
    negativeFeedbackFile: null as File | null,
    binanceIdScreenshotFile: null as File | null,
    additionalDocumentsFile: null as File | null,
  });

  const handleFileUpload = (field: string, file: File | null) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('File upload error:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!formData.counterpartyName || !formData.orderAmount || !formData.binanceIdScreenshotFile) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in counterparty name, order amount, and upload Binance ID screenshot.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Upload files
      const aadharFrontUrl = formData.aadharFrontFile ? await uploadFile(formData.aadharFrontFile, 'aadhar-front') : null;
      const aadharBackUrl = formData.aadharBackFile ? await uploadFile(formData.aadharBackFile, 'aadhar-back') : null;
      const verifiedFeedbackUrl = formData.verifiedFeedbackFile ? await uploadFile(formData.verifiedFeedbackFile, 'verified-feedback') : null;
      const negativeFeedbackUrl = formData.negativeFeedbackFile ? await uploadFile(formData.negativeFeedbackFile, 'negative-feedback') : null;
      const binanceIdUrl = await uploadFile(formData.binanceIdScreenshotFile!, 'binance-id');
      const additionalDocsUrl = formData.additionalDocumentsFile ? await uploadFile(formData.additionalDocumentsFile, 'additional-docs') : null;

      if (!binanceIdUrl) {
        throw new Error('Failed to upload Binance ID screenshot');
      }

      // Insert into database
      const { error } = await supabase
        .from('kyc_approval_requests')
        .insert({
          counterparty_name: formData.counterpartyName,
          order_amount: parseFloat(formData.orderAmount),
          purpose_of_buying: formData.purposeOfBuying || null,
          additional_info: formData.additionalInfo || null,
          aadhar_front_url: aadharFrontUrl,
          aadhar_back_url: aadharBackUrl,
          verified_feedback_url: verifiedFeedbackUrl,
          negative_feedback_url: negativeFeedbackUrl,
          binance_id_screenshot_url: binanceIdUrl,
          additional_documents_url: additionalDocsUrl,
        });

      if (error) {
        throw error;
      }

      toast({
        title: "KYC Request Created",
        description: "Your KYC approval request has been submitted successfully.",
      });

      // Reset form
      setFormData({
        counterpartyName: "",
        orderAmount: "",
        purposeOfBuying: "",
        additionalInfo: "",
        aadharFrontFile: null,
        aadharBackFile: null,
        verifiedFeedbackFile: null,
        negativeFeedbackFile: null,
        binanceIdScreenshotFile: null,
        additionalDocumentsFile: null,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating KYC request:', error);
      toast({
        title: "Error",
        description: "Failed to create KYC request. Please try again.",
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
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Create KYC Approval Request
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Counterparty Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="counterpartyName">Counterparty Name *</Label>
                <Input
                  id="counterpartyName"
                  value={formData.counterpartyName}
                  onChange={(e) => setFormData(prev => ({ ...prev, counterpartyName: e.target.value }))}
                  placeholder="Enter counterparty name"
                />
              </div>
              
              <div>
                <Label htmlFor="orderAmount" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Order Amount *
                </Label>
                <Input
                  id="orderAmount"
                  type="number"
                  value={formData.orderAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, orderAmount: e.target.value }))}
                  placeholder="Enter order amount"
                />
              </div>
              
              <div>
                <Label htmlFor="purposeOfBuying">Purpose of Buying</Label>
                <Input
                  id="purposeOfBuying"
                  value={formData.purposeOfBuying}
                  onChange={(e) => setFormData(prev => ({ ...prev, purposeOfBuying: e.target.value }))}
                  placeholder="Enter purpose of buying"
                />
              </div>
            </CardContent>
          </Card>

          {/* Document Uploads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Required Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Aadhar Front Image
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('aadharFrontFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="aadhar-front"
                    />
                    <label htmlFor="aadhar-front" className="cursor-pointer">
                      {formData.aadharFrontFile ? (
                        <span className="text-green-600">{formData.aadharFrontFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to upload Aadhar front</span>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Aadhar Back Image
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('aadharBackFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="aadhar-back"
                    />
                    <label htmlFor="aadhar-back" className="cursor-pointer">
                      {formData.aadharBackFile ? (
                        <span className="text-green-600">{formData.aadharBackFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to upload Aadhar back</span>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Verified Feedback Screenshot
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('verifiedFeedbackFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="verified-feedback"
                    />
                    <label htmlFor="verified-feedback" className="cursor-pointer">
                      {formData.verifiedFeedbackFile ? (
                        <span className="text-green-600">{formData.verifiedFeedbackFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to upload verified feedback</span>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Negative Feedback Screenshot
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('negativeFeedbackFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="negative-feedback"
                    />
                    <label htmlFor="negative-feedback" className="cursor-pointer">
                      {formData.negativeFeedbackFile ? (
                        <span className="text-red-600">{formData.negativeFeedbackFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to upload negative feedback</span>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-red-600">
                    <Image className="h-4 w-4" />
                    Binance ID Screenshot *
                  </Label>
                  <div className="border-2 border-dashed border-red-300 rounded-lg p-4 text-center bg-red-50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('binanceIdScreenshotFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="binance-id"
                    />
                    <label htmlFor="binance-id" className="cursor-pointer">
                      {formData.binanceIdScreenshotFile ? (
                        <span className="text-green-600">{formData.binanceIdScreenshotFile.name}</span>
                      ) : (
                        <span className="text-red-600">Click to upload Binance ID screenshot (Required)</span>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Additional Documents (Optional)
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => handleFileUpload('additionalDocumentsFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="additional-docs"
                    />
                    <label htmlFor="additional-docs" className="cursor-pointer">
                      {formData.additionalDocumentsFile ? (
                        <span className="text-green-600">{formData.additionalDocumentsFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Click to upload additional documents</span>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="additionalInfo">Additional Details</Label>
                <Textarea
                  id="additionalInfo"
                  value={formData.additionalInfo}
                  onChange={(e) => setFormData(prev => ({ ...prev, additionalInfo: e.target.value }))}
                  placeholder="Enter any additional information that may help with the approval process..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit for Approval"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
