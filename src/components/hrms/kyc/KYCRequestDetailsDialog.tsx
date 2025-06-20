
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, User, DollarSign, FileText, Image as ImageIcon } from "lucide-react";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
  purpose_of_buying?: string;
  status: string;
  created_at: string;
  additional_info?: string;
  aadhar_front_image_url?: string;
  aadhar_back_image_url?: string;
  verified_feedback_screenshot_url?: string;
  negative_feedback_screenshot_url?: string;
  review_date?: string;
  rejection_reason?: string;
}

interface KYCRequestDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: KYCRequest | null;
}

export function KYCRequestDetailsDialog({ open, onOpenChange, request }: KYCRequestDetailsDialogProps) {
  if (!request) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'QUERY':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            KYC Request Details - {request.counterparty_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Basic Info */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(request.status)}>
                    {request.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">
                    Requested: {new Date(request.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">
                    Amount: ₹{request.order_amount.toLocaleString()}
                  </span>
                </div>
                {request.purpose_of_buying && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">Purpose: {request.purpose_of_buying}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          {request.additional_info && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-2">Additional Information</h4>
                <p className="text-sm text-gray-700">{request.additional_info}</p>
              </CardContent>
            </Card>
          )}

          {/* Rejection Reason */}
          {request.rejection_reason && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-2 text-red-700">Rejection Reason</h4>
                <p className="text-sm text-red-600">{request.rejection_reason}</p>
              </CardContent>
            </Card>
          )}

          {/* Document Attachments */}
          <Card>
            <CardContent className="p-4">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Document Attachments
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {request.aadhar_front_image_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Aadhar Front</p>
                    <div className="border rounded p-2 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-xs text-gray-500 mt-1">Image Attached</p>
                    </div>
                  </div>
                )}
                {request.aadhar_back_image_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Aadhar Back</p>
                    <div className="border rounded p-2 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-xs text-gray-500 mt-1">Image Attached</p>
                    </div>
                  </div>
                )}
                {request.verified_feedback_screenshot_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Verified Feedback</p>
                    <div className="border rounded p-2 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-xs text-gray-500 mt-1">Screenshot Attached</p>
                    </div>
                  </div>
                )}
                {request.negative_feedback_screenshot_url && (
                  <div>
                    <p className="text-sm font-medium mb-2">Negative Feedback</p>
                    <div className="border rounded p-2 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-xs text-gray-500 mt-1">Screenshot Attached</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
