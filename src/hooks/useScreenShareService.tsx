
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ScreenShareRequest {
  id: string;
  admin_id: string;
  target_user_id: string;
  admin_username: string;
  status: 'pending' | 'accepted' | 'declined' | 'ended';
  created_at: string;
}

interface ScreenShareStream {
  user_id: string;
  admin_id: string;
  stream: MediaStream | null;
}

export function useScreenShareService() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeStreams, setActiveStreams] = useState<Map<string, ScreenShareStream>>(new Map());
  const [incomingRequests, setIncomingRequests] = useState<ScreenShareRequest[]>([]);
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);

  // Listen for incoming screen share requests (for employees)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('screen-share-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'screen_share_requests',
          filter: `target_user_id=eq.${user.id}`
        },
        (payload) => {
          const request = payload.new as ScreenShareRequest;
          setIncomingRequests(prev => [...prev, request]);
          
          toast({
            title: "Screen Share Request",
            description: `${request.admin_username} is requesting to view your screen`,
            duration: 10000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'screen_share_requests',
          filter: `target_user_id=eq.${user.id}`
        },
        (payload) => {
          const request = payload.new as ScreenShareRequest;
          if (request.status === 'ended') {
            // Stop sharing screen
            stopScreenShare();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Listen for screen share responses (for admins)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('screen-share-responses')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'screen_share_requests',
          filter: `admin_id=eq.${user.id}`
        },
        (payload) => {
          const request = payload.new as ScreenShareRequest;
          
          if (request.status === 'accepted') {
            toast({
              title: "Screen Share Accepted",
              description: "User accepted your screen share request",
            });
          } else if (request.status === 'declined') {
            toast({
              title: "Screen Share Declined",
              description: "User declined your screen share request",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Request screen share from a user (admin function)
  const requestScreenShare = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (!user) return;

    try {
      // Use type assertion to bypass TypeScript error for now
      const { error } = await (supabase as any)
        .from('screen_share_requests')
        .insert({
          admin_id: user.id,
          target_user_id: targetUserId,
          admin_username: user.username || user.email || 'Admin',
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Request Sent",
        description: `Screen share request sent to ${targetUsername}`,
      });
    } catch (error) {
      console.error('Error requesting screen share:', error);
      toast({
        title: "Request Failed",
        description: "Failed to send screen share request",
        variant: "destructive",
      });
    }
  }, [user, toast]);

  // Accept screen share request (employee function)
  const acceptScreenShare = useCallback(async (requestId: string) => {
    try {
      // Start screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: true
      });

      setCurrentStream(stream);

      // Update request status - use type assertion
      const { error } = await (supabase as any)
        .from('screen_share_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (error) throw error;

      // Remove from incoming requests
      setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

      // Handle stream end
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(requestId);
      };

      toast({
        title: "Screen Sharing Started",
        description: "Your screen is now being shared",
      });

    } catch (error) {
      console.error('Screen share failed:', error);
      
      // Update request status to declined - use type assertion
      await (supabase as any)
        .from('screen_share_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Screen Share Failed",
        description: "Failed to start screen sharing or permission denied",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Decline screen share request (employee function)
  const declineScreenShare = useCallback(async (requestId: string) => {
    try {
      // Use type assertion
      await (supabase as any)
        .from('screen_share_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Request Declined",
        description: "Screen share request declined",
      });
    } catch (error) {
      console.error('Error declining screen share:', error);
    }
  }, [toast]);

  // Stop screen sharing
  const stopScreenShare = useCallback(async (requestId?: string) => {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      setCurrentStream(null);
    }

    if (requestId) {
      // Use type assertion
      await (supabase as any)
        .from('screen_share_requests')
        .update({ status: 'ended' })
        .eq('id', requestId);
    }

    toast({
      title: "Screen Sharing Stopped",
      description: "Screen sharing has been ended",
    });
  }, [currentStream, toast]);

  // End screen share session (admin function)
  const endScreenShare = useCallback(async (requestId: string) => {
    try {
      // Use type assertion
      await (supabase as any)
        .from('screen_share_requests')
        .update({ status: 'ended' })
        .eq('id', requestId);

      toast({
        title: "Screen Share Ended",
        description: "Screen sharing session ended",
      });
    } catch (error) {
      console.error('Error ending screen share:', error);
    }
  }, [toast]);

  return {
    requestScreenShare,
    acceptScreenShare,
    declineScreenShare,
    stopScreenShare,
    endScreenShare,
    incomingRequests,
    currentStream,
    activeStreams
  };
}
