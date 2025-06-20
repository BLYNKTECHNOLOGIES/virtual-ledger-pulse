
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Eye, Video, Calendar, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScheduleVideoKYCDialog } from "./ScheduleVideoKYCDialog";

interface VideoKYCSession {
  id: string;
  kyc_request_id: string;
  status: string;
  scheduled_at: string | null;
  session_notes: string | null;
  created_at: string;
  kyc_approval_requests: {
    id: string;
    counterparty_name: string;
    order_amount: number;
    purpose_of_buying: string | null;
    binance_id_screenshot_url: string;
    created_at: string;
  };
}

export function NewVideoKYCTab() {
  const [videoKYCSessions, setVideoKYCSessions] = useState<VideoKYCSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<VideoKYCSession | null>(null);
  const { toast } = useToast();

  const fetchVideoKYCSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('video_kyc_sessions')
        .select(`
          *,
          kyc_approval_requests (
            id,
            counterparty_name,
            order_amount,
            purpose_of_buying,
            binance_id_screenshot_url,
            created_at
          )
        `)
        .in('status', ['PENDING', 'SCHEDULED'])
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setVideoKYCSessions(data || []);
    } catch (error) {
      console.error('Error fetching video KYC sessions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch video KYC sessions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoKYCSessions();
  }, []);

  const handleScheduleVideoKYC = (session: VideoKYCSession) => {
    setSelectedSession(session);
    setScheduleDialogOpen(true);
  };

  const handleScheduleSuccess = () => {
    fetchVideoKYCSessions();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading video KYC sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pending Video KYC Sessions</h3>
        <div className="text-sm text-gray-500">
          Total Sessions: {videoKYCSessions.length}
        </div>
      </div>

      {videoKYCSessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No pending video KYC sessions found.</p>
            <p className="text-sm text-gray-400 mt-2">Sessions will appear here when queries require video KYC verification.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {videoKYCSessions.map((session) => (
            <Card key={session.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {session.kyc_approval_requests.counterparty_name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge className={
                      session.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }>
                      {session.status}
                    </Badge>
                    <Badge variant="outline" className="text-purple-600">
                      <Video className="h-3 w-3 mr-1" />
                      VIDEO KYC
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Order Amount</p>
                    <p className="font-medium">₹{session.kyc_approval_requests.order_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Purpose</p>
                    <p className="font-medium">{session.kyc_approval_requests.purpose_of_buying || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Sent for Video KYC</p>
                    <p className="font-medium">{new Date(session.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Original Request</p>
                    <p className="font-medium">{new Date(session.kyc_approval_requests.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {session.scheduled_at && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                    <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Scheduled for: {new Date(session.scheduled_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {session.session_notes && (
                  <div className="mb-4 p-2 bg-gray-50 rounded border-l-4 border-gray-400">
                    <p className="text-sm font-medium text-gray-800">Notes:</p>
                    <p className="text-sm text-gray-700">{session.session_notes}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleScheduleVideoKYC(session)}
                    className="flex items-center gap-2"
                  >
                    {session.status === 'PENDING' ? (
                      <>
                        <Calendar className="h-4 w-4" />
                        Schedule Session
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4" />
                        Reschedule
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                  >
                    <Phone className="h-4 w-4" />
                    Contact Customer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ScheduleVideoKYCDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        session={selectedSession}
        onSuccess={handleScheduleSuccess}
      />
    </div>
  );
}
