
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, User, DollarSign, FileText, Plus } from "lucide-react";

interface CreateKYCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateKYCRequestDialog({ open, onOpenChange }: CreateKYCRequestDialogProps) {
  const [formData, setFormData] = useState({
    counterpartyName: "",
    orderAmount: "",
    purposeOfBuying: "",
    additionalInfo: "",
    aadharFrontFile: null as File | null,
    aadharBackFile: null as File | null,
    verifiedFeedbackFile: null as File | null,
    negativeFeedbackFile: null as File | null,
  });

  const handleFileUpload = (field: string, file: File | null) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const handleSubmit = async () => {
    // Handle form submission logic here
    console.log("Submitting KYC request:", formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    Aadhar Front Image *
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
                    Aadhar Back Image *
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
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="flex-1">
              Submit for Approval
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
