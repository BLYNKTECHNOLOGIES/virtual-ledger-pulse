
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, MessageSquare, Video, FileText, User } from "lucide-react";

interface KYCTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kycRequest: any;
}

interface TimelineEvent {
  date: string;
  status: string;
  title: string;
  description: string;
  icon: any;
  color: string;
}

export function KYCTimelineDialog({ open, onOpenChange, kycRequest }: KYCTimelineDialogProps) {
  if (!kycRequest) return null;

  const generateTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    // KYC Request Created
    events.push({
      date: new Date(kycRequest.created_at).toLocaleDateString(),
      status: "CREATED",
      title: "KYC Request Submitted",
      description: `KYC request submitted for ${kycRequest.counterparty_name} with order amount ₹${kycRequest.order_amount?.toLocaleString()}`,
      icon: FileText,
      color: "text-blue-600"
    });

    // Check for queries
    if (kycRequest.kyc_queries && kycRequest.kyc_queries.length > 0) {
      kycRequest.kyc_queries.forEach((query: any) => {
        events.push({
          date: new Date(query.created_at || kycRequest.created_at).toLocaleDateString(),
          status: "QUERIED",
          title: "Query Raised",
          description: query.manual_query || "Query raised for additional information",
          icon: MessageSquare,
          color: "text-yellow-600"
        });

        if (query.resolved) {
          events.push({
            date: new Date(query.resolved_at || kycRequest.updated_at).toLocaleDateString(),
            status: "QUERY_RESOLVED",
            title: "Query Resolved",
            description: query.response_text || "Query resolved successfully",
            icon: CheckCircle,
            color: "text-green-600"
          });
        }
      });
    }

    // Check for Video KYC
    if (kycRequest.additional_info?.includes('Video KYC Completed')) {
      const vkycRating = kycRequest.additional_info.match(/Rating: (\d+)\/10/);
      events.push({
        date: new Date(kycRequest.updated_at).toLocaleDateString(),
        status: "VIDEO_KYC_COMPLETED",
        title: "Video KYC Completed",
        description: `Video KYC session completed successfully${vkycRating ? ` with rating ${vkycRating[1]}/10` : ''}`,
        icon: Video,
        color: "text-purple-600"
      });
    }

    // Final Status
    if (kycRequest.status === 'APPROVED') {
      events.push({
        date: new Date(kycRequest.updated_at).toLocaleDateString(),
        status: "APPROVED",
        title: "KYC Approved",
        description: "KYC request has been approved and is ready for payment processing",
        icon: CheckCircle,
        color: "text-green-600"
      });
    } else if (kycRequest.status === 'REJECTED') {
      events.push({
        date: new Date(kycRequest.updated_at).toLocaleDateString(),
        status: "REJECTED",
        title: "KYC Rejected",
        description: "KYC request has been rejected",
        icon: CheckCircle,
        color: "text-red-600"
      });
    } else if (kycRequest.status === 'PENDING') {
      events.push({
        date: new Date().toLocaleDateString(),
        status: "PENDING",
        title: "Pending Review",
        description: "KYC request is currently under review",
        icon: Clock,
        color: "text-orange-600"
      });
    }

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const timeline = generateTimeline();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            KYC Timeline - {kycRequest.counterparty_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-4">
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
            
            <div className="space-y-6">
              {timeline.map((event, index) => {
                const Icon = event.icon;
                return (
                  <div key={index} className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 ${
                      event.status === 'APPROVED' ? 'border-green-500' :
                      event.status === 'REJECTED' ? 'border-red-500' :
                      event.status === 'QUERIED' ? 'border-yellow-500' :
                      event.status === 'VIDEO_KYC_COMPLETED' ? 'border-purple-500' :
                      'border-blue-500'
                    }`}>
                      <Icon className={`h-4 w-4 ${event.color}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-gray-900">{event.title}</h4>
                        <Badge variant="outline" className={
                          event.status === 'APPROVED' ? 'text-green-600 border-green-300' :
                          event.status === 'REJECTED' ? 'text-red-600 border-red-300' :
                          event.status === 'QUERIED' || event.status === 'QUERY_RESOLVED' ? 'text-yellow-600 border-yellow-300' :
                          event.status === 'VIDEO_KYC_COMPLETED' ? 'text-purple-600 border-purple-300' :
                          'text-blue-600 border-blue-300'
                        }>
                          {event.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{event.description}</p>
                      <p className="text-xs text-gray-400">{event.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
