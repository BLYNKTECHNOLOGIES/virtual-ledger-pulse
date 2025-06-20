
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, FileText, Image } from "lucide-react";

interface KYCDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
}

export function KYCDetailsDialog({ open, onOpenChange, kycRequest }: KYCDetailsDialogProps) {
  if (!kycRequest) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            KYC Request Details - {kycRequest.counterpartyName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Counterparty Name</p>
              <p className="font-medium">{kycRequest.counterpartyName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Order Amount</p>
              <p className="font-medium">₹{kycRequest.orderAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Purpose of Buying</p>
              <p className="font-medium">{kycRequest.purposeOfBuying}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Requested Date</p>
              <p className="font-medium">{kycRequest.createdAt}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-3">Documents Submitted</h3>
            <div className="grid grid-cols-2 gap-4">
              {kycRequest.hasAadharFront && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Image className="h-4 w-4" />
                    <span className="font-medium">Aadhar Front</span>
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                  </div>
                  <Button variant="outline" size="sm">View Document</Button>
                </div>
              )}
              
              {kycRequest.hasAadharBack && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Image className="h-4 w-4" />
                    <span className="font-medium">Aadhar Back</span>
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                  </div>
                  <Button variant="outline" size="sm">View Document</Button>
                </div>
              )}
              
              {kycRequest.hasVerifiedFeedback && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Verified Feedback</span>
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                  </div>
                  <Button variant="outline" size="sm">View Screenshot</Button>
                </div>
              )}
              
              {kycRequest.hasNegativeFeedback && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Negative Feedback</span>
                    <Badge variant="outline" className="text-red-600">Available</Badge>
                  </div>
                  <Button variant="outline" size="sm">View Screenshot</Button>
                </div>
              )}
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
