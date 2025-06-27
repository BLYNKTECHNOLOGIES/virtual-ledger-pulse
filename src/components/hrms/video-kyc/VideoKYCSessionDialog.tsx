
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, FileText, Video, User, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VideoKYCSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
  onSuccess?: () => void;
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
      // Update KYC request status to PENDING with Video KYC completion details
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({ 
          status: 'PENDING',
          additional_info: `${kycRequest.additional_info || ''}\n\nVideo KYC Completed Successfully\nRating: ${rating}/10\nNotes: ${notes}`
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
            <Video className="h-5 w-5 text-blue-600" />
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

            {/* Documents Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {kycRequest.aadhar_front_url && (
                    <div className="p-3 border rounded-lg">
                      <Badge variant="outline" className="text-green-600 mb-2">Aadhar Front</Badge>
                      <p className="text-xs text-gray-500">Click to view document</p>
                    </div>
                  )}
                  {kycRequest.aadhar_back_url && (
                    <div className="p-3 border rounded-lg">
                      <Badge variant="outline" className="text-green-600 mb-2">Aadhar Back</Badge>
                      <p className="text-xs text-gray-500">Click to view document</p>
                    </div>
                  )}
                  <div className="p-3 border rounded-lg">
                    <Badge variant="outline" className="text-blue-600 mb-2">Binance ID</Badge>
                    <p className="text-xs text-gray-500">Screenshot available</p>
                  </div>
                  {kycRequest.verified_feedback_url && (
                    <div className="p-3 border rounded-lg">
                      <Badge variant="outline" className="text-green-600 mb-2">Verified Feedback</Badge>
                      <p className="text-xs text-gray-500">Click to view document</p>
                    </div>
                  )}
                  {kycRequest.negative_feedback_url && (
                    <div className="p-3 border rounded-lg">
                      <Badge variant="outline" className="text-red-600 mb-2">Negative Feedback</Badge>
                      <p className="text-xs text-gray-500">Click to view document</p>
                    </div>
                  )}
                  {kycRequest.additional_documents_url && (
                    <div className="p-3 border rounded-lg">
                      <Badge variant="outline" className="text-purple-600 mb-2">Additional Docs</Badge>
                      <p className="text-xs text-gray-500">Click to view document</p>
                    </div>
                  )}
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
