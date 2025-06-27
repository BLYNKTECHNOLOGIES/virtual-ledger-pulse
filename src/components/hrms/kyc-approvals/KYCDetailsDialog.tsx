
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, FileText, Image, Download, ExternalLink, Eye, Video, Play, Star } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { useState } from "react";

interface KYCDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
}

export function KYCDetailsDialog({ open, onOpenChange, kycRequest }: KYCDetailsDialogProps) {
  const [videoViewerOpen, setVideoViewerOpen] = useState(false);

  if (!kycRequest) return null;

  const handleViewDocument = (url: string) => {
    window.open(url, '_blank');
  };

  const isVideoKYCCompleted = () => {
    return kycRequest.additional_info?.includes('Video KYC Completed Successfully');
  };

  const getVKYCVideoUrl = () => {
    if (!kycRequest.additional_info) return null;
    
    const videoUrlMatch = kycRequest.additional_info.match(/Video URL: (https?:\/\/[^\s]+)/);
    if (videoUrlMatch) {
      return videoUrlMatch[1];
    }
    
    if (kycRequest.verified_feedback_url && kycRequest.verified_feedback_url.includes('vkyc-videos')) {
      return kycRequest.verified_feedback_url;
    }
    
    if (kycRequest.negative_feedback_url && kycRequest.negative_feedback_url.includes('vkyc-videos')) {
      return kycRequest.negative_feedback_url;
    }
    
    return null;
  };

  const extractVKYCRating = () => {
    if (!kycRequest.additional_info) return null;
    const ratingMatch = kycRequest.additional_info.match(/Rating: (\d+)\/10/);
    return ratingMatch ? ratingMatch[1] : null;
  };

  const extractVKYCNotes = () => {
    if (!kycRequest.additional_info) return null;
    const notesMatch = kycRequest.additional_info.match(/Notes: ([^\n]+)/);
    return notesMatch ? notesMatch[1] : null;
  };

  const DocumentCard = ({ 
    title, 
    icon: Icon, 
    url, 
    isRequired = false, 
    iconColor = "text-blue-600",
    badgeColor = "text-green-600" 
  }: {
    title: string;
    icon: any;
    url: string | null;
    isRequired?: boolean;
    iconColor?: string;
    badgeColor?: string;
  }) => {
    const isImage = url && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp'));
    
    return (
      <div className={`border rounded-lg p-4 ${isRequired ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`h-5 w-5 ${isRequired ? 'text-red-600' : iconColor}`} />
          <span className="font-medium">{title}</span>
          {isRequired && (
            <Badge variant="outline" className="text-red-600 border-red-300">Required</Badge>
          )}
        </div>
        
        {url ? (
          <div className="space-y-3">
            <Badge variant="outline" className={badgeColor}>Available</Badge>
            
            {isImage && (
              <div className="mt-3">
                <div className="w-full h-48 border rounded-lg overflow-hidden bg-gray-50">
                  <OptimizedImage
                    src={url}
                    alt={title}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
            
            {!isImage && (
              <div className="mt-3 p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Document available</p>
              </div>
            )}
            
            <div className="flex gap-2 mt-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleViewDocument(url)}
                className="flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                View Full Size
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleViewDocument(url)}
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </Button>
            </div>
          </div>
        ) : (
          <Badge variant="outline" className="text-gray-600">Not Provided</Badge>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
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

            {/* VKYC Information Widget - Only show if VKYC completed */}
            {isVideoKYCCompleted() && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Video className="h-5 w-5 text-blue-600" />
                  Video KYC Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">VKYC Status</p>
                    <Badge className="bg-green-100 text-green-800">Completed Successfully</Badge>
                  </div>
                  {extractVKYCRating() && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Rating</p>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{extractVKYCRating()}/10</span>
                        <div className="flex">
                          {[...Array(parseInt(extractVKYCRating() || '0'))].map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-500">Video Recording</p>
                    {getVKYCVideoUrl() ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setVideoViewerOpen(true)}
                        className="flex items-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        View Recording
                      </Button>
                    ) : (
                      <p className="text-sm text-gray-500">Not available</p>
                    )}
                  </div>
                </div>
                {extractVKYCNotes() && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-500">VKYC Notes</p>
                    <p className="text-sm text-gray-700 mt-1">{extractVKYCNotes()}</p>
                  </div>
                )}
              </div>
            )}

            {/* Additional Information */}
            {(kycRequest.additional_info || kycRequest.additionalInfo) && !isVideoKYCCompleted() && (
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
                <DocumentCard
                  title="Binance ID Screenshot"
                  icon={Image}
                  url={kycRequest.binance_id_screenshot_url}
                  isRequired={true}
                  iconColor="text-red-600"
                  badgeColor="text-green-600"
                />

                {/* Aadhar Front */}
                <DocumentCard
                  title="Aadhar Front"
                  icon={Image}
                  url={kycRequest.aadhar_front_url}
                  iconColor="text-blue-600"
                  badgeColor="text-green-600"
                />

                {/* Aadhar Back */}
                <DocumentCard
                  title="Aadhar Back"
                  icon={Image}
                  url={kycRequest.aadhar_back_url}
                  iconColor="text-blue-600"
                  badgeColor="text-green-600"
                />
                
                {/* Verified Feedback - Only show if not VKYC video */}
                {kycRequest.verified_feedback_url && !kycRequest.verified_feedback_url.includes('vkyc-videos') && (
                  <DocumentCard
                    title="Verified Feedback"
                    icon={FileText}
                    url={kycRequest.verified_feedback_url}
                    iconColor="text-green-600"
                    badgeColor="text-green-600"
                  />
                )}
                
                {/* Negative Feedback - Only show if not VKYC video */}
                {kycRequest.negative_feedback_url && !kycRequest.negative_feedback_url.includes('vkyc-videos') && (
                  <DocumentCard
                    title="Negative Feedback"
                    icon={FileText}
                    url={kycRequest.negative_feedback_url}
                    iconColor="text-red-600"
                    badgeColor="text-red-600"
                  />
                )}

                {/* Additional Documents */}
                <DocumentCard
                  title="Additional Documents"
                  icon={FileText}
                  url={kycRequest.additional_documents_url}
                  iconColor="text-purple-600"
                  badgeColor="text-purple-600"
                />
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

      {/* VKYC Video Viewer Dialog */}
      <Dialog open={videoViewerOpen} onOpenChange={setVideoViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              VKYC Recording - {kycRequest.counterparty_name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {getVKYCVideoUrl() ? (
              <video 
                controls 
                className="w-full max-h-96"
                src={getVKYCVideoUrl()}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="text-center p-8 text-gray-500">
                <Video className="h-12 w-12 mx-auto mb-4" />
                <p>No VKYC recording available for this request.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
