
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Square, Play, Pause, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RemoteMonitoringManagerProps {
  userId: string;
  username: string;
  onStreamStart?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
}

type MonitoringStatus = 'idle' | 'requesting' | 'pending' | 'connected' | 'declined' | 'error';

export function RemoteMonitoringManager({ userId, username, onStreamStart, onStreamEnd }: RemoteMonitoringManagerProps) {
  const [status, setStatus] = useState<MonitoringStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionTime, setConnectionTime] = useState<Date | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  // Simulate sending a monitoring request to the remote user
  const sendMonitoringRequest = async () => {
    try {
      setStatus('requesting');
      
      toast({
        title: "Monitoring Request Sent",
        description: `Requesting screen access from ${username}...`,
      });

      // Simulate network request to notify the remote user
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStatus('pending');
      
      // Simulate user response (in real app, this would be handled by the remote user)
      setTimeout(() => {
        simulateUserResponse();
      }, 3000);

    } catch (error) {
      console.error('Failed to send monitoring request:', error);
      setStatus('error');
      toast({
        title: "Request Failed",
        description: "Failed to send monitoring request",
        variant: "destructive",
      });
    }
  };

  // Simulate the remote user's response (accept/decline)
  const simulateUserResponse = () => {
    // In a real application, this would be determined by the actual user's action
    const userAccepted = Math.random() > 0.3; // 70% chance of acceptance for demo
    
    if (userAccepted) {
      acceptMonitoringRequest();
    } else {
      declineMonitoringRequest();
    }
  };

  const acceptMonitoringRequest = async () => {
    try {
      setStatus('connected');
      setConnectionTime(new Date());
      
      // In a real scenario, this would establish a WebRTC connection to the remote user's screen
      // For demo purposes, we'll create a simulated stream
      const simulatedStream = await createSimulatedStream();
      setStream(simulatedStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = simulatedStream;
        await videoRef.current.play();
      }

      onStreamStart?.(simulatedStream);
      
      toast({
        title: "Monitoring Started",
        description: `${username} accepted the request. Now monitoring their screen.`,
      });

    } catch (error) {
      console.error('Failed to start monitoring:', error);
      setStatus('error');
    }
  };

  const declineMonitoringRequest = () => {
    setStatus('declined');
    toast({
      title: "Request Declined",
      description: `${username} declined the monitoring request`,
      variant: "destructive",
    });
  };

  // Create a simulated stream for demo purposes
  const createSimulatedStream = async (): Promise<MediaStream> => {
    // In a real app, this would be the remote user's actual screen stream
    // For demo, we'll create a canvas-based stream with some content
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    
    // Draw simulated desktop content
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(50, 50, 200, 150);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText(`${username}'s Desktop`, 70, 130);
    ctx.fillText('Simulated Remote Screen', 70, 160);
    
    // Add some animated content
    let frame = 0;
    const animate = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(300, 50, 200, 150);
      
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(320 + Math.sin(frame * 0.1) * 20, 70, 160, 110);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Live Activity', 340, 130);
      
      frame++;
      requestAnimationFrame(animate);
    };
    animate();
    
    return canvas.captureStream(30);
  };

  const stopMonitoring = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setStatus('idle');
    setConnectionTime(null);
    onStreamEnd?.();
    
    toast({
      title: "Monitoring Stopped",
      description: `Stopped monitoring ${username}'s screen`,
    });
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'idle':
        return <Badge variant="secondary">Offline</Badge>;
      case 'requesting':
        return <Badge variant="outline" className="animate-pulse">Sending Request...</Badge>;
      case 'pending':
        return <Badge variant="outline" className="animate-pulse">Awaiting Response</Badge>;
      case 'connected':
        return <Badge variant="default" className="bg-green-600">Live Monitoring</Badge>;
      case 'declined':
        return <Badge variant="destructive">Request Declined</Badge>;
      case 'error':
        return <Badge variant="destructive">Connection Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getActionButton = () => {
    switch (status) {
      case 'idle':
      case 'declined':
      case 'error':
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={sendMonitoringRequest}
            className="flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            Request Screen Access
          </Button>
        );
      case 'requesting':
      case 'pending':
        return (
          <Button
            size="sm"
            variant="outline"
            disabled
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4 animate-spin" />
            {status === 'requesting' ? 'Sending...' : 'Waiting for Response'}
          </Button>
        );
      case 'connected':
        return (
          <Button
            size="sm"
            variant="destructive"
            onClick={stopMonitoring}
            className="flex items-center gap-2"
          >
            <Square className="h-4 w-4" />
            Stop Monitoring
          </Button>
        );
      default:
        return null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Remote Screen Monitoring</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {getActionButton()}
        </div>
        
        {status === 'pending' && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-800">
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                Waiting for {username} to respond to the monitoring request...
              </span>
            </div>
          </div>
        )}

        {status === 'declined' && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">
                {username} declined the monitoring request. You can try again later.
              </span>
            </div>
          </div>
        )}
        
        {status === 'connected' && (
          <div className="space-y-2">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-40 bg-gray-900 rounded border object-contain"
              style={{ 
                backgroundColor: '#1a1a1a',
                minHeight: '160px'
              }}
            />
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span>Live feed from {username}'s desktop</span>
              {connectionTime && (
                <span>Connected since {connectionTime.toLocaleTimeString()}</span>
              )}
            </div>
            {stream && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>
                  Stream active • {stream.getVideoTracks().length} video track(s) • 30 FPS
                </span>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500">
          <p><strong>Note:</strong> Remote monitoring requires user consent. The target user will receive a notification and must accept the request to share their screen.</p>
        </div>
      </CardContent>
    </Card>
  );
}
