
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, User, FileText, Image, CheckCircle, XCircle, ArrowRight, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Badge } from "@/components/ui/badge";

interface KYCQueryResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: any;
  onSuccess?: () => void;
}

export function KYCQueryResolutionDialog({ open, onOpenChange, query, onSuccess }: KYCQueryResolutionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [resolutionData, setResolutionData] = useState({
    resolutionText: "",
    resolutionFile: null as File | null,
    aadharFrontFile: null as File | null,
    aadharBackFile: null as File | null,
    action: "", // "approve", "reject", "move_to_pending", "move_to_video_kyc"
  });

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('File upload error:', error);
      return null;
    }
  };

  const handleFileUpload = (field: string, file: File | null) => {
    setResolutionData(prev => ({ ...prev, [field]: file }));
  };

  const handleResolveQuery = async (action: string) => {
    if (!resolutionData.resolutionText.trim()) {
      toast({
        title: "Resolution Required",
        description: "Please provide resolution details.",
        variant: "destructive",
      });
      return;
    }

    // For moving to pending, require Aadhar documents
    if (action === "move_to_pending" && (!resolutionData.aadharFrontFile || !resolutionData.aadharBackFile)) {
      toast({
        title: "Missing Required Documents",
        description: "Aadhar front and back documents are required when moving to pending KYC.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Upload resolution file if provided
      let resolutionFileUrl = null;
      if (resolutionData.resolutionFile) {
        resolutionFileUrl = await uploadFile(resolutionData.resolutionFile, 'resolutions');
      }

      // Upload Aadhar documents if provided
      let aadharFrontUrl = null;
      let aadharBackUrl = null;
      if (resolutionData.aadharFrontFile) {
        aadharFrontUrl = await uploadFile(resolutionData.aadharFrontFile, 'aadhar-front');
      }
      if (resolutionData.aadharBackFile) {
        aadharBackUrl = await uploadFile(resolutionData.aadharBackFile, 'aadhar-back');
      }

      // Update the query as resolved
      const { error: queryError } = await supabase
        .from('kyc_queries')
        .update({ 
          resolved: true, 
          resolved_at: new Date().toISOString(),
          response_text: resolutionData.resolutionText,
        })
        .eq('id', query.id);

      if (queryError) throw queryError;

      // Handle different actions
      let newStatus = query.kyc_approval_requests.status;
      let updateData: any = {};

      switch (action) {
        case "approve":
          newStatus = "APPROVED";
          break;
        case "reject":
          newStatus = "REJECTED";
          break;
        case "move_to_pending":
          newStatus = "PENDING";
          // Update Aadhar URLs if new ones were uploaded
          if (aadharFrontUrl) updateData.aadhar_front_url = aadharFrontUrl;
          if (aadharBackUrl) updateData.aadhar_back_url = aadharBackUrl;
          break;
        case "move_to_video_kyc":
          // Create video KYC entry
          const { error: videoKycError } = await supabase
            .from('video_kyc_sessions')
            .insert({
              kyc_request_id: query.kyc_request_id,
              status: 'PENDING',
              created_at: new Date().toISOString()
            });
          
          if (videoKycError) {
            console.error('Video KYC creation error:', videoKycError);
          }
          
          newStatus = "QUERIED"; // Keep as queried but mark for video KYC
          break;
      }

      // Update KYC request status and any additional data
      const { error: kycError } = await supabase
        .from('kyc_approval_requests')
        .update({ 
          status: newStatus,
          ...updateData
        })
        .eq('id', query.kyc_request_id);

      if (kycError) throw kycError;

      // Show appropriate success message
      let successMessage = "";
      switch (action) {
        case "approve":
          successMessage = `${query.kyc_approval_requests.counterparty_name}'s KYC has been approved. Proceed with payment process.`;
          break;
        case "reject":
          successMessage = "KYC request has been rejected and moved to rejected KYC.";
          break;
        case "move_to_pending":
          successMessage = "KYC request has been moved back to pending KYC with resolution details.";
          break;
        case "move_to_video_kyc":
          successMessage = "KYC request has been sent for Video KYC verification.";
          break;
      }

      toast({
        title: "Query Resolved",
        description: successMessage,
      });

      onSuccess?.();
      onOpenChange(false);
      
      // Reset form
      setResolutionData({
        resolutionText: "",
        resolutionFile: null,
        aadharFrontFile: null,
        aadharBackFile: null,
        action: "",
      });

    } catch (error) {
      console.error('Error resolving query:', error);
      toast({
        title: "Error",
        description: "Failed to resolve query. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!query) return null;

  const isImage = (url: string) => {
    return url && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Resolve KYC Query - {query.kyc_approval_requests.counterparty_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Query Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Query Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Counterparty</p>
                  <p className="font-medium">{query.kyc_approval_requests.counterparty_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Order Amount</p>
                  <p className="font-medium">₹{query.kyc_approval_requests.order_amount.toLocaleString()}</p>
                </div>
              </div>
              
              {query.manual_query && (
                <div className="p-3 bg-purple-50 rounded border-l-4 border-purple-400">
                  <p className="text-sm font-medium text-purple-800">Manual Query:</p>
                  <p className="text-sm text-purple-700">{query.manual_query}</p>
                </div>
              )}

              {query.vkyc_required && (
                <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                  <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Video KYC Required
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resolution Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resolution Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="resolutionText">Resolution Text *</Label>
                <Textarea
                  id="resolutionText"
                  value={resolutionData.resolutionText}
                  onChange={(e) => setResolutionData(prev => ({ ...prev, resolutionText: e.target.value }))}
                  placeholder="Provide detailed resolution explanation..."
                  rows={4}
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Resolution Attachment (Optional)
                </Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => handleFileUpload('resolutionFile', e.target.files?.[0] || null)}
                    className="hidden"
                    id="resolution-file"
                  />
                  <label htmlFor="resolution-file" className="cursor-pointer">
                    {resolutionData.resolutionFile ? (
                      <span className="text-green-600">{resolutionData.resolutionFile.name}</span>
                    ) : (
                      <span className="text-gray-500">Click to upload resolution document</span>
                    )}
                  </label>
                </div>

                {/* Image Preview for Resolution File */}
                {resolutionData.resolutionFile && isImage(resolutionData.resolutionFile.name) && (
                  <div className="mt-3">
                    <div className="w-full h-48 border rounded-lg overflow-hidden bg-gray-50">
                      <img
                        src={URL.createObjectURL(resolutionData.resolutionFile)}
                        alt="Resolution Preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Aadhar Documents Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Aadhar Front *
                  </Label>
                  <div className="border-2 border-dashed border-red-300 rounded-lg p-4 text-center bg-red-50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('aadharFrontFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="aadhar-front-resolution"
                    />
                    <label htmlFor="aadhar-front-resolution" className="cursor-pointer">
                      {resolutionData.aadharFrontFile ? (
                        <span className="text-green-600">{resolutionData.aadharFrontFile.name}</span>
                      ) : (
                        <span className="text-red-600">Upload Aadhar Front (Required for moving to pending)</span>
                      )}
                    </label>
                  </div>

                  {/* Aadhar Front Preview */}
                  {resolutionData.aadharFrontFile && (
                    <div className="mt-3">
                      <div className="w-full h-32 border rounded-lg overflow-hidden bg-gray-50">
                        <img
                          src={URL.createObjectURL(resolutionData.aadharFrontFile)}
                          alt="Aadhar Front Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Aadhar Back *
                  </Label>
                  <div className="border-2 border-dashed border-red-300 rounded-lg p-4 text-center bg-red-50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload('aadharBackFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="aadhar-back-resolution"
                    />
                    <label htmlFor="aadhar-back-resolution" className="cursor-pointer">
                      {resolutionData.aadharBackFile ? (
                        <span className="text-green-600">{resolutionData.aadharBackFile.name}</span>
                      ) : (
                        <span className="text-red-600">Upload Aadhar Back (Required for moving to pending)</span>
                      )}
                    </label>
                  </div>

                  {/* Aadhar Back Preview */}
                  {resolutionData.aadharBackFile && (
                    <div className="mt-3">
                      <div className="w-full h-32 border rounded-lg overflow-hidden bg-gray-50">
                        <img
                          src={URL.createObjectURL(resolutionData.aadharBackFile)}
                          alt="Aadhar Back Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button 
              onClick={() => handleResolveQuery("approve")} 
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              Approve KYC
            </Button>
            
            <Button 
              onClick={() => handleResolveQuery("reject")} 
              disabled={isSubmitting}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Reject KYC
            </Button>
            
            <Button 
              onClick={() => handleResolveQuery("move_to_pending")} 
              disabled={isSubmitting}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              Move to Pending
            </Button>

            {query.vkyc_required && (
              <Button 
                onClick={() => handleResolveQuery("move_to_video_kyc")} 
                disabled={isSubmitting}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Video className="h-4 w-4" />
                Send to Video KYC
              </Button>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
