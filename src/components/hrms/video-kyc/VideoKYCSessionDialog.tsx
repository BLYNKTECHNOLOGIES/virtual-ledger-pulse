
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, FileText, User, X, Plus, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VideoKYCSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
  onSuccess?: () => void;
}

interface DocumentPreviewProps {
  url: string;
  label: string;
  badgeColor: string;
}

function DocumentPreview({ url, label, badgeColor }: DocumentPreviewProps) {
  const [showEnlarged, setShowEnlarged] = useState(false);

  if (!url) return null;

  return (
    <div className="relative">
      <div 
        className="p-3 border rounded-lg cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setShowEnlarged(true)}
      >
        <Badge variant="outline" className={`${badgeColor} mb-2`}>{label}</Badge>
        <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center">
          <img 
            src={url} 
            alt={label}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden text-gray-500 text-sm">Preview not available</div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">Click to view full size</p>
          <Eye className="h-4 w-4 text-gray-400" />
        </div>
      </div>
      
      {showEnlarged && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">{label}</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowEnlarged(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <img 
                src={url} 
                alt={label}
                className="max-w-full max-h-full object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VideoKYCSessionDialog({ open, onOpenChange, kycRequest, onSuccess }: VideoKYCSessionDialogProps) {
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [kycVideoFile, setKycVideoFile] = useState<File | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [failureProof, setFailureProof] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [showSuccessForm, setShowSuccessForm] = useState(false);
  const { toast } = useToast();

  const handleSuccess = () => {
    setShowSuccessForm(true);
    setShowFailureForm(false);
  };

  const handleFailure = () => {
    setShowFailureForm(true);
    setShowSuccessForm(false);
  };

  const uploadVideoFile = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `vkyc-videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: "Upload Error",
        description: "Failed to upload video file.",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleSuccessSubmit = async () => {
    if (rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please provide a rating for the Video KYC session.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      let videoUrl = null;
      
      // Upload video if provided
      if (kycVideoFile) {
        videoUrl = await uploadVideoFile(kycVideoFile);
        if (!videoUrl) {
          setIsSubmitting(false);
          return;
        }
      }

      // Update KYC request status to PENDING with Video KYC completion details
      const additionalInfo = `${kycRequest.additional_info || ''}\n\nVideo KYC Completed Successfully\nRating: ${rating}/10\nNotes: ${notes}${videoUrl ? `\nVideo URL: ${videoUrl}` : ''}`;
      
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({ 
          status: 'PENDING',
          additional_info: additionalInfo,
          // Store video URL in verified_feedback_url if no video exists there, otherwise use negative_feedback_url
          ...(videoUrl && {
            [kycRequest.verified_feedback_url ? 'negative_feedback_url' : 'verified_feedback_url']: videoUrl
          })
        })
        .eq('id', kycRequest.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Video KYC Completed",
        description: "Video KYC session completed successfully. KYC moved back to pending.",
      });

      // Reset form
      setNotes("");
      setRating(0);
      setKycVideoFile(null);
      setShowSuccessForm(false);
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error completing Video KYC:', error);
      toast({
        title: "Error",
        description: "Failed to complete Video KYC. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFailureSubmit = async () => {
    if (!failureReason.trim()) {
      toast({
        title: "Failure Reason Required",
        description: "Please provide a reason for the failure.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Create a new query for the failed Video KYC
      const { error: queryError } = await supabase
        .from('kyc_queries')
        .insert({
          kyc_request_id: kycRequest.id,
          manual_query: `Video KYC Failed: ${failureReason}`,
          vkyc_required: true,
          resolved: false
        });

      if (queryError) {
        throw queryError;
      }

      // Update KYC request status to QUERIED
      const { error: updateError } = await supabase
        .from('kyc_approval_requests')
        .update({ status: 'QUERIED' })
        .eq('id', kycRequest.id);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "Video KYC Failed",
        description: "Video KYC failure recorded and moved to queries.",
      });

      // Reset form
      setFailureReason("");
      setFailureProof(null);
      setNotes("");
      setShowFailureForm(false);
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error recording Video KYC failure:', error);
      toast({
        title: "Error",
        description: "Failed to record Video KYC failure. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForms = () => {
    setShowSuccessForm(false);
    setShowFailureForm(false);
    setNotes("");
    setRating(0);
    setHoverRating(0);
    setKycVideoFile(null);
    setFailureReason("");
    setFailureProof(null);
  };

  if (!kycRequest) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Video KYC Session - {kycRequest.counterparty_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client Information Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Client Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Name</Label>
                    <p className="font-medium">{kycRequest.counterparty_name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Order Amount</Label>
                    <p className="font-medium">₹{kycRequest.order_amount?.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Purpose</Label>
                    <p className="font-medium">{kycRequest.purpose_of_buying || "Not specified"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Request Date</Label>
                    <p className="font-medium">{new Date(kycRequest.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                
                {kycRequest.additional_info && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Additional Information</Label>
                    <p className="text-sm mt-1 p-2 bg-gray-50 rounded">{kycRequest.additional_info}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents Section with Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <DocumentPreview 
                    url={kycRequest.aadhar_front_url}
                    label="Aadhar Front"
                    badgeColor="text-green-600"
                  />
                  <DocumentPreview 
                    url={kycRequest.aadhar_back_url}
                    label="Aadhar Back"
                    badgeColor="text-green-600"
                  />
                  <DocumentPreview 
                    url={kycRequest.binance_id_screenshot_url}
                    label="Binance ID"
                    badgeColor="text-blue-600"
                  />
                  <DocumentPreview 
                    url={kycRequest.verified_feedback_url}
                    label="Verified Feedback"
                    badgeColor="text-green-600"
                  />
                  <DocumentPreview 
                    url={kycRequest.negative_feedback_url}
                    label="Negative Feedback"
                    badgeColor="text-red-600"
                  />
                  <DocumentPreview 
                    url={kycRequest.additional_documents_url}
                    label="Additional Docs"
                    badgeColor="text-purple-600"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Video KYC Control Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Video KYC Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="notes">Session Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about the Video KYC session..."
                    rows={4}
                    className="mt-1"
                  />
                </div>

                {!showSuccessForm && !showFailureForm && (
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleFailure}
                      variant="destructive" 
                      className="flex-1"
                    >
                      VKYC Unsuccessful
                    </Button>
                    <Button 
                      onClick={handleSuccess}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      VKYC Successful
                    </Button>
                  </div>
                )}

                {/* Success Form */}
                {showSuccessForm && (
                  <div className="space-y-4 p-4 bg-green-50 rounded-lg border-l-4 border-green-400">
                    <h4 className="font-medium text-green-800">Video KYC Successful</h4>
                    
                    <div>
                      <Label>Rating (1-10 stars)</Label>
                      <div className="flex gap-1 mt-2">
                        {[...Array(10)].map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRating(i + 1)}
                            onMouseEnter={() => setHoverRating(i + 1)}
                            onMouseLeave={() => setHoverRating(0)}
                            className="focus:outline-none"
                          >
                            <Star 
                              className={`h-6 w-6 ${
                                (hoverRating || rating) > i 
                                  ? 'fill-yellow-400 text-yellow-400' 
                                  : 'text-gray-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {rating > 0 && `Rating: ${rating}/10`}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="kyc-video">Upload KYC Video (Optional)</Label>
                      <Input
                        id="kyc-video"
                        type="file"
                        accept="video/*"
                        onChange={(e) => setKycVideoFile(e.target.files?.[0] || null)}
                        className="mt-1"
                      />
                      {kycVideoFile && (
                        <p className="text-sm text-gray-600 mt-1">
                          Selected: {kycVideoFile.name}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetForms} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSuccessSubmit}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isSubmitting ? "Submitting..." : "Complete Video KYC"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Failure Form */}
                {showFailureForm && (
                  <div className="space-y-4 p-4 bg-red-50 rounded-lg border-l-4 border-red-400">
                    <h4 className="font-medium text-red-800">Video KYC Unsuccessful</h4>
                    
                    <div>
                      <Label htmlFor="failure-reason">Reason for Failure *</Label>
                      <Textarea
                        id="failure-reason"
                        value={failureReason}
                        onChange={(e) => setFailureReason(e.target.value)}
                        placeholder="Explain why the Video KYC failed..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="failure-proof">Upload Proof (Optional)</Label>
                      <Input
                        id="failure-proof"
                        type="file"
                        accept="image/*,video/*,.pdf"
                        onChange={(e) => setFailureProof(e.target.files?.[0] || null)}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetForms} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleFailureSubmit}
                        disabled={isSubmitting}
                        variant="destructive"
                      >
                        {isSubmitting ? "Submitting..." : "Submit Failure Report"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
