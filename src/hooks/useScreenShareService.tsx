
import { useEffect, useState, useCallback, useRef } from 'react';
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
  
  // Use refs to track subscription state
  const requestsChannelRef = useRef<any>(null);
  const responsesChannelRef = useRef<any>(null);

  // Clean up function for channels
  const cleanupChannels = useCallback(() => {
    if (requestsChannelRef.current) {
      try {
        supabase.removeChannel(requestsChannelRef.current);
      } catch (error) {
        console.log('Channel cleanup error (safe to ignore):', error);
      }
      requestsChannelRef.current = null;
    }

    if (responsesChannelRef.current) {
      try {
        supabase.removeChannel(responsesChannelRef.current);
      } catch (error) {
        console.log('Channel cleanup error (safe to ignore):', error);
      }
      responsesChannelRef.current = null;
    }
  }, []);

  // Listen for incoming screen share requests (for employees)
  useEffect(() => {
    if (!user) return;

    cleanupChannels();

    try {
      const channel = supabase
        .channel(`screen-share-requests-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'screen_share_requests',
            filter: `target_user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('New screen share request received:', payload);
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
            console.log('Screen share request updated:', payload);
            const request = payload.new as ScreenShareRequest;
            if (request.status === 'ended') {
              stopScreenShare();
            }
          }
        )
        .subscribe((status) => {
          console.log('Requests channel subscription status:', status);
        });

      requestsChannelRef.current = channel;
    } catch (error) {
      console.error('Error setting up requests channel:', error);
    }

    return cleanupChannels;
  }, [user?.id, toast, cleanupChannels]);

  // Listen for screen share responses (for admins)
  useEffect(() => {
    if (!user) return;

    try {
      const channel = supabase
        .channel(`screen-share-responses-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'screen_share_requests',
            filter: `admin_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Screen share response received:', payload);
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
        .subscribe((status) => {
          console.log('Responses channel subscription status:', status);
        });

      responsesChannelRef.current = channel;
    } catch (error) {
      console.error('Error setting up responses channel:', error);
    }
  }, [user?.id, toast]);

  // Request screen share from a user (admin function)
  const requestScreenShare = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (!user) {
      console.error('No user found for screen share request');
      return;
    }

    try {
      console.log('Requesting screen share from:', targetUserId, 'by:', user.id);
      
      const { data, error } = await supabase
        .from('screen_share_requests')
        .insert({
          admin_id: user.id,
          target_user_id: targetUserId,
          admin_username: user.username || user.email || 'Admin',
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Screen share request created:', data);

      toast({
        title: "Request Sent",
        description: `Screen share request sent to ${targetUsername}`,
      });
      
      return data.id;
    } catch (error) {
      console.error('Error requesting screen share:', error);
      toast({
        title: "Request Failed",
        description: "Failed to send screen share request. Please try again.",
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

      // Update request status
      const { error } = await supabase
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
      
      // Update request status to declined
      await supabase
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
      await supabase
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
      await supabase
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
      await supabase
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
