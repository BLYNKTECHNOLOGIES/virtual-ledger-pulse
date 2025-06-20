
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, FileText, Image, Download, ExternalLink } from "lucide-react";

interface KYCDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
}

export function KYCDetailsDialog({ open, onOpenChange, kycRequest }: KYCDetailsDialogProps) {
  if (!kycRequest) return null;

  const handleViewDocument = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            KYC Request Details - {kycRequest.counterparty_name || kycRequest.counterpartyName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Counterparty Name</p>
              <p className="font-medium">{kycRequest.counterparty_name || kycRequest.counterpartyName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Order Amount</p>
              <p className="font-medium">₹{(kycRequest.order_amount || kycRequest.orderAmount)?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Purpose of Buying</p>
              <p className="font-medium">{kycRequest.purpose_of_buying || kycRequest.purposeOfBuying || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Requested Date</p>
              <p className="font-medium">{new Date(kycRequest.created_at || kycRequest.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Status</p>
              <Badge className={
                kycRequest.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                kycRequest.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                kycRequest.status === 'QUERIED' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-800'
              }>
                {kycRequest.status || 'PENDING'}
              </Badge>
            </div>
          </div>

          {/* Additional Information */}
          {(kycRequest.additional_info || kycRequest.additionalInfo) && (
            <div>
              <h4 className="text-lg font-medium mb-2">Additional Information</h4>
              <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                <p className="text-sm text-blue-700">{kycRequest.additional_info || kycRequest.additionalInfo}</p>
              </div>
            </div>
          )}

          {/* Documents Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Documents Submitted</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Binance ID Screenshot - Mandatory */}
              <div className="border rounded-lg p-4 bg-red-50 border-red-200">
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-800">Binance ID Screenshot</span>
                  <Badge variant="outline" className="text-red-600 border-red-300">Required</Badge>
                </div>
                {kycRequest.binance_id_screenshot_url ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDocument(kycRequest.binance_id_screenshot_url)}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-red-600">Not Provided</Badge>
                )}
              </div>

              {/* Aadhar Front */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Aadhar Front</span>
                </div>
                {(kycRequest.aadhar_front_url || kycRequest.hasAadharFront) ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                    {kycRequest.aadhar_front_url && (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewDocument(kycRequest.aadhar_front_url)}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
                )}
              </div>

              {/* Aadhar Back */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Aadhar Back</span>
                </div>
                {(kycRequest.aadhar_back_url || kycRequest.hasAadharBack) ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                    {kycRequest.aadhar_back_url && (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewDocument(kycRequest.aadhar_back_url)}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
                )}
              </div>
              
              {/* Verified Feedback */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Verified Feedback</span>
                </div>
                {(kycRequest.verified_feedback_url || kycRequest.hasVerifiedFeedback) ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                    {kycRequest.verified_feedback_url && (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewDocument(kycRequest.verified_feedback_url)}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Screenshot
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
                )}
              </div>
              
              {/* Negative Feedback */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-red-600" />
                  <span className="font-medium">Negative Feedback</span>
                </div>
                {(kycRequest.negative_feedback_url || kycRequest.hasNegativeFeedback) ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-red-600">Available</Badge>
                    {kycRequest.negative_feedback_url && (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewDocument(kycRequest.negative_feedback_url)}
                          className="flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Screenshot
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
                )}
              </div>

              {/* Additional Documents */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-purple-600" />
                  <span className="font-medium">Additional Documents</span>
                </div>
                {kycRequest.additional_documents_url ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-purple-600">Available</Badge>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDocument(kycRequest.additional_documents_url)}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Document
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
