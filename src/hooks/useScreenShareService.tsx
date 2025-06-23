
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
  updated_at: string;
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
  
  // Use refs to track subscription state and prevent multiple subscriptions
  const requestsChannelRef = useRef<any>(null);
  const responsesChannelRef = useRef<any>(null);
  const isSubscribedRef = useRef(false);

  // Clean up function for channels
  const cleanupChannels = useCallback(async () => {
    console.log('Cleaning up channels...');
    
    if (requestsChannelRef.current) {
      try {
        await supabase.removeChannel(requestsChannelRef.current);
        console.log('Requests channel cleaned up');
      } catch (error) {
        console.log('Requests channel cleanup error (safe to ignore):', error);
      }
      requestsChannelRef.current = null;
    }

    if (responsesChannelRef.current) {
      try {
        await supabase.removeChannel(responsesChannelRef.current);
        console.log('Responses channel cleaned up');
      } catch (error) {
        console.log('Responses channel cleanup error (safe to ignore):', error);
      }
      responsesChannelRef.current = null;
    }
    
    isSubscribedRef.current = false;
  }, []);

  // Listen for incoming screen share requests (for employees)
  useEffect(() => {
    if (!user?.id || isSubscribedRef.current) {
      console.log('Skipping subscription setup - user not available or already subscribed');
      return;
    }

    console.log('Setting up screen share subscriptions for user:', user.id);

    const setupSubscriptions = async () => {
      // Clean up any existing subscriptions first
      await cleanupChannels();

      try {
        // Create unique channel name to avoid conflicts
        const channelName = `screen-share-requests-${user.id}-${Date.now()}`;
        const channel = supabase.channel(channelName);
        
        channel
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
            if (status === 'SUBSCRIBED') {
              isSubscribedRef.current = true;
            }
          });

        requestsChannelRef.current = channel;

        // Set up responses channel for admins
        const responsesChannelName = `screen-share-responses-${user.id}-${Date.now()}`;
        const responsesChannel = supabase.channel(responsesChannelName);
        
        responsesChannel
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

        responsesChannelRef.current = responsesChannel;

      } catch (error) {
        console.error('Error setting up subscriptions:', error);
        isSubscribedRef.current = false;
      }
    };

    setupSubscriptions();

    return () => {
      cleanupChannels();
    };
  }, [user?.id, toast, cleanupChannels]);

  // Request screen share from a user (admin function)
  const requestScreenShare = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (!user?.id) {
      console.error('No user found for screen share request');
      toast({
        title: "Authentication Error",
        description: "You must be logged in to request screen sharing",
        variant: "destructive",
      });
      return null;
    }

    try {
      console.log('Requesting screen share from:', targetUserId, 'by:', user.id);
      
      const requestData = {
        admin_id: user.id,
        target_user_id: targetUserId,
        admin_username: user.username || user.email || 'Admin',
        status: 'pending' as const
      };

      console.log('Inserting screen share request:', requestData);

      const { data, error } = await supabase
        .from('screen_share_requests')
        .insert(requestData)
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Screen share request created successfully:', data);

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
      return null;
    }
  }, [user, toast]);

  // Accept screen share request (employee function)
  const acceptScreenShare = useCallback(async (requestId: string) => {
    try {
      console.log('Accepting screen share request:', requestId);

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

      if (error) {
        console.error('Error updating request status:', error);
        throw error;
      }

      // Remove from incoming requests
      setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

      // Handle stream end
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen share stream ended by user');
        stopScreenShare(requestId);
      };

      toast({
        title: "Screen Sharing Started",
        description: "Your screen is now being shared",
      });

    } catch (error) {
      console.error('Screen share failed:', error);
      
      // Update request status to declined on error
      try {
        await supabase
          .from('screen_share_requests')
          .update({ status: 'declined' })
          .eq('id', requestId);
      } catch (updateError) {
        console.error('Error updating request status to declined:', updateError);
      }

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
      console.log('Declining screen share request:', requestId);

      const { error } = await supabase
        .from('screen_share_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      if (error) {
        console.error('Error declining request:', error);
        throw error;
      }

      setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Request Declined",
        description: "Screen share request declined",
      });
    } catch (error) {
      console.error('Error declining screen share:', error);
      toast({
        title: "Error",
        description: "Failed to decline request",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Stop screen sharing
  const stopScreenShare = useCallback(async (requestId?: string) => {
    console.log('Stopping screen share, requestId:', requestId);

    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      setCurrentStream(null);
    }

    if (requestId) {
      try {
        await supabase
          .from('screen_share_requests')
          .update({ status: 'ended' })
          .eq('id', requestId);
      } catch (error) {
        console.error('Error ending screen share request:', error);
      }
    }

    toast({
      title: "Screen Sharing Stopped",
      description: "Screen sharing has been ended",
    });
  }, [currentStream, toast]);

  // End screen share session (admin function)
  const endScreenShare = useCallback(async (requestId: string) => {
    try {
      console.log('Ending screen share session:', requestId);

      const { error } = await supabase
        .from('screen_share_requests')
        .update({ status: 'ended' })
        .eq('id', requestId);

      if (error) {
        console.error('Error ending screen share:', error);
        throw error;
      }

      toast({
        title: "Screen Share Ended",
        description: "Screen sharing session ended",
      });
    } catch (error) {
      console.error('Error ending screen share:', error);
      toast({
        title: "Error",
        description: "Failed to end screen sharing session",
        variant: "destructive",
      });
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
