import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Eye, EyeOff, Wifi, WifiOff, Maximize2, Minimize2, Clock, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useScreenShareService } from '@/hooks/useScreenShareService';
import { supabase } from '@/integrations/supabase/client';

interface RemoteDisplayMonitorProps {
  userId: string;
  username: string;
  isActive: boolean;
  onMonitoringStart?: () => void;
  onMonitoringStop?: () => void;
}

type MonitoringState = 'idle' | 'requesting' | 'pending' | 'connected' | 'declined' | 'error';

export function RemoteDisplayMonitor({ 
  userId, 
  username, 
  isActive, 
  onMonitoringStart, 
  onMonitoringStop 
}: RemoteDisplayMonitorProps) {
  const [monitoringState, setMonitoringState] = useState<MonitoringState>('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionTime, setConnectionTime] = useState<Date | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<any>(null);
  const { toast } = useToast();
  const { requestScreenShare, endScreenShare } = useScreenShareService();

  // Clean up channel on unmount
  useEffect(() => {
    return () => {
      cleanupChannel();
    };
  }, []);

  const cleanupChannel = () => {
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (error) {
        console.log('Channel cleanup error (safe to ignore):', error);
      }
      channelRef.current = null;
    }
  };

  // Listen for screen share request updates
  useEffect(() => {
    if (!currentRequestId) {
      cleanupChannel();
      return;
    }

    // Clean up any existing channel first
    cleanupChannel();

    try {
      // Create new channel with unique name
      const channelName = `screen-share-monitor-${userId}-${currentRequestId}-${Date.now()}`;
      const channel = supabase.channel(channelName);
      
      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'screen_share_requests',
            filter: `id=eq.${currentRequestId}`
          },
          (payload) => {
            console.log('Screen share request update:', payload);
            const request = payload.new as any;
            
            if (request.status === 'accepted') {
              setMonitoringState('connected');
              setConnectionTime(new Date());
              onMonitoringStart?.();
              simulateStreamConnection();
              
            } else if (request.status === 'declined') {
              setMonitoringState('declined');
              setCurrentRequestId(null);
              
            } else if (request.status === 'ended') {
              handleStreamEnd();
            }
          }
        )
        .subscribe((status) => {
          console.log('Channel subscription status:', status);
        });

      channelRef.current = channel;

    } catch (error) {
      console.error('Error setting up channel subscription:', error);
      setMonitoringState('error');
    }

    return cleanupChannel;
  }, [currentRequestId, userId, onMonitoringStart]);

  const simulateStreamConnection = () => {
    // In a real app, this would be the actual WebRTC stream from the employee
    // For demo purposes, we'll create a simulated feed
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    
    let frame = 0;
    const animate = () => {
      if (monitoringState !== 'connected') return;
      
      // Simulate employee's desktop
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Simulated browser window
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 100, 1000, 500);
      
      // Window header
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(100, 100, 1000, 40);
      
      // Simulate typing activity
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText(`${username}'s Live Desktop Activity`, 120, 125);
      ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 120, 180);
      ctx.fillText('Document Editor - typing...', 120, 220);
      
      // Animated cursor
      const cursorX = 300 + Math.sin(frame * 0.1) * 200;
      const cursorY = 250 + Math.cos(frame * 0.05) * 100;
      ctx.fillStyle = '#000000';
      ctx.fillRect(cursorX, cursorY, 2, 20);
      
      // Simulated text being typed
      const text = 'This is simulated live employee activity...'.substring(0, Math.floor(frame / 10) % 50);
      ctx.fillText(text, 120, 280);
      
      frame++;
      requestAnimationFrame(animate);
    };
    
    animate();
    
    const stream = canvas.captureStream(30);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  };

  const startScreenShare = async () => {
    if (!isActive) {
      toast({
        title: "User Not Active",
        description: `${username} is not currently online`,
        variant: "destructive",
      });
      return;
    }

    try {
      setMonitoringState('requesting');
      
      toast({
        title: "Sending Request",
        description: `Requesting screen access from ${username}...`,
      });

      const requestId = await requestScreenShare(userId, username);
      if (requestId) {
        setCurrentRequestId(requestId);
        setMonitoringState('pending');
      } else {
        setMonitoringState('error');
      }

    } catch (error) {
      console.error('Screen share request failed:', error);
      setMonitoringState('error');
      
      toast({
        title: "Request Failed",
        description: "Failed to send screen share request",
        variant: "destructive",
      });
    }
  };

  const handleStreamEnd = () => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setMonitoringState('idle');
    setConnectionTime(null);
    setIsFullscreen(false);
    setCurrentRequestId(null);
    onMonitoringStop?.();

    toast({
      title: "Screen Sharing Ended",
      description: `Stopped viewing ${username}'s display`,
    });
  };

  const stopMonitoring = async () => {
    if (currentRequestId) {
      try {
        await endScreenShare(currentRequestId);
      } catch (error) {
        console.error('Error ending screen share:', error);
      }
    }
    handleStreamEnd();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getStatusBadge = () => {
    switch (monitoringState) {
      case 'idle':
        return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>;
      case 'requesting':
        return <Badge variant="outline" className="animate-pulse"><Send className="h-3 w-3 mr-1" />Sending Request...</Badge>;
      case 'pending':
        return <Badge variant="outline" className="animate-pulse"><Clock className="h-3 w-3 mr-1" />Awaiting Permission</Badge>;
      case 'connected':
        return <Badge variant="default" className="bg-green-600"><Wifi className="h-3 w-3 mr-1" />Live</Badge>;
      case 'declined':
        return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />Declined</Badge>;
      case 'error':
        return <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">{username}'s Display - Live Remote View</h2>
            {getStatusBadge()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </Button>
            <Button variant="destructive" size="sm" onClick={stopMonitoring}>
              <EyeOff className="h-4 w-4 mr-2" />
              Stop Monitoring
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain rounded-lg"
            style={{ maxHeight: 'calc(100vh - 80px)' }}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Remote Screen Monitor
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {(monitoringState === 'idle' || monitoringState === 'error' || monitoringState === 'declined') ? (
            <Button
              size="sm"
              variant="outline"
              onClick={startScreenShare}
              disabled={!isActive}
              className="flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Request Screen Access
            </Button>
          ) : monitoringState === 'requesting' || monitoringState === 'pending' ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4 animate-spin" />
              {monitoringState === 'requesting' ? 'Sending Request...' : 'Waiting for User...'}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleFullscreen}
                className="flex items-center gap-2"
              >
                <Maximize2 className="h-4 w-4" />
                Fullscreen
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                className="flex items-center gap-2"
              >
                <EyeOff className="h-4 w-4" />
                Stop
              </Button>
            </div>
          )}
        </div>

        {!isActive && (
          <div className="p-2 bg-amber-50 rounded border border-amber-200">
            <p className="text-xs text-amber-700">
              User is not currently active. Screen sharing is only available for online users.
            </p>
          </div>
        )}

        {monitoringState === 'pending' && (
          <div className="p-2 bg-blue-50 rounded border border-blue-200">
            <p className="text-xs text-blue-700">
              Request sent to {username}. Waiting for them to accept screen sharing permission.
            </p>
          </div>
        )}

        {monitoringState === 'declined' && (
          <div className="p-2 bg-red-50 rounded border border-red-200">
            <p className="text-xs text-red-700">
              {username} declined the screen sharing request. You can try again later.
            </p>
          </div>
        )}

        {monitoringState === 'connected' && (
          <div className="space-y-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-48 bg-gray-900 rounded border object-contain"
              style={{ backgroundColor: '#000000' }}
            />
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live remote view from {username}
              </span>
              {connectionTime && (
                <span>Connected: {connectionTime.toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
          <p><strong>Note:</strong> This sends a request to the employee's browser. They must accept to share their screen.</p>
        </div>
      </CardContent>
    </Card>
  );
}
