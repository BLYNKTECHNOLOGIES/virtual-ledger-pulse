
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Square, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>();
  const { toast } = useToast();

  // Create a persistent simulated desktop stream
  const createSimulatedDesktopStream = (): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    
    let frame = 0;
    let mouseX = 100;
    let mouseY = 100;
    let mouseDirectionX = 1;
    let mouseDirectionY = 1;
    
    const animate = () => {
      // Clear canvas with desktop background
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw desktop wallpaper pattern
      ctx.fillStyle = '#1e40af';
      for (let i = 0; i < canvas.width; i += 100) {
        for (let j = 0; j < canvas.height; j += 100) {
          if ((i + j) % 200 === 0) {
            ctx.fillRect(i, j, 50, 50);
          }
        }
      }
      
      // Draw taskbar
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
      
      // Draw start button
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(10, canvas.height - 50, 80, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.fillText('Start', 25, canvas.height - 25);
      
      // Draw window
      const windowX = 200 + Math.sin(frame * 0.01) * 50;
      const windowY = 150 + Math.cos(frame * 0.01) * 30;
      
      // Window background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(windowX, windowY, 400, 300);
      
      // Window title bar
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(windowX, windowY, 400, 30);
      
      // Window title
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Arial';
      ctx.fillText(`${username}'s Application`, windowX + 10, windowY + 20);
      
      // Window close button
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(windowX + 370, windowY + 5, 20, 20);
      
      // Window content
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(windowX + 10, windowY + 40, 380, 250);
      
      // Simulate text content
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px Arial';
      ctx.fillText('Document Content...', windowX + 20, windowY + 60);
      ctx.fillText(`User: ${username}`, windowX + 20, windowY + 80);
      ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, windowX + 20, windowY + 100);
      
      // Animated cursor
      mouseX += mouseDirectionX * 2;
      mouseY += mouseDirectionY * 1.5;
      
      if (mouseX > canvas.width - 20 || mouseX < 20) mouseDirectionX *= -1;
      if (mouseY > canvas.height - 80 || mouseY < 20) mouseDirectionY *= -1;
      
      // Draw cursor
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(mouseX, mouseY);
      ctx.lineTo(mouseX + 12, mouseY + 4);
      ctx.lineTo(mouseX + 4, mouseY + 12);
      ctx.closePath();
      ctx.fill();
      
      // Draw cursor outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Activity indicator
      const activityText = `Live Activity - Frame ${Math.floor(frame / 60)}`;
      ctx.fillStyle = '#10b981';
      ctx.font = '14px Arial';
      ctx.fillText(activityText, 20, 30);
      
      frame++;
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    return canvas.captureStream(30);
  };

  const sendMonitoringRequest = async () => {
    try {
      setStatus('requesting');
      
      toast({
        title: "Monitoring Request Sent",
        description: `Requesting screen access from ${username}...`,
      });

      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStatus('pending');
      
      // Auto-accept after 2 seconds for demo
      setTimeout(() => {
        acceptMonitoringRequest();
      }, 2000);

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

  const acceptMonitoringRequest = async () => {
    try {
      setStatus('connected');
      setConnectionTime(new Date());
      
      // Create the simulated stream
      const simulatedStream = createSimulatedDesktopStream();
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

  const stopMonitoring = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
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
              className="w-full h-40 bg-gray-900 rounded border object-cover"
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
